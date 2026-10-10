import { IntentMatchSpan, IntentClassifier, IntentClassificationResult, ScamIntentType } from './intent-classifier';
import { SemanticTriggerEngine } from './semantic-trigger';
import { SupportedLanguage } from './language-detector';
import { RequestFrame } from './request-analyzer';

export interface ChatMessageContext {
  id: string;
  rawText: string;
  normalizedText: string;
  timestamp: number;
  direction: 'inbound' | 'outbound';
  clusters: string[];
  matchedSpans: IntentMatchSpan[];
  detectedLanguage: SupportedLanguage;
  isMixedLanguage: boolean;
  requestFrames?: RequestFrame[];
}

export class ChatSessionState {
  private static messages: ChatMessageContext[] = [];
  private static readonly MAX_MESSAGES_PER_DIRECTION = 30;
  private static readonly TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
  private static readonly FULL_WEIGHT_MS = 60 * 1000;
  private static readonly HALF_LIFE_MS = 5 * 60 * 1000;

  // Incremented on reset so cached verdicts cannot cross conversation sessions.
  public static sessionRevision = 0;

  // Latest AI verdict; SAFE does not grant session-wide immunity.
  public static sessionLlmVerdict: 'SCAM' | 'SAFE' | null = null;
  /** Legacy diagnostic value; never used to authorize SAFE reuse. */
  public static sessionLlmImmunityPeakScore: number = 0;

  public static reset() {
    this.sessionRevision += 1;
    this.messages = []; 
    this.sessionLlmVerdict = null;
    this.sessionLlmImmunityPeakScore = 0;
  }

  public static getRecentMessages(): ChatMessageContext[] {
    this.cleanExpired();
    return [...this.messages];
  }

  /**
   * Форматування історії діалогу обох сторін для передачі у промпт ШІ та Нейромонітор
   */
  public static getDialogueHistory(currentDraft?: string): string {
    this.cleanExpired();
    const lines: string[] = [];

    for (const msg of this.messages) {
      const speaker = msg.direction === 'outbound' ? '[Ви]' : '[Співрозмовник]';
      lines.push(`${speaker}: ${msg.rawText}`);
    }

    if (currentDraft && currentDraft.trim().length > 0) {
      lines.push(`[Ви (Чернетка)]: ${currentDraft.trim()}`);
    }

    return lines.join('\n');
  }

  public static addMessageAndEvaluate(
    rawText: string,
    direction: 'inbound' | 'outbound'
  ): IntentClassificationResult {
    this.cleanExpired();

    // 1. Extract clusters for the current message
    const { matchedSpans, detectedClusterMap, normalizedText, detectedLanguage, isMixedLanguage, requestFrames } = IntentClassifier.extractClusters(rawText);

    // 2. Save it to state
    this.messages.push({
      id: Math.random().toString(36).substring(7),
      rawText,
      normalizedText,
      timestamp: Date.now(),
      direction,
      clusters: direction === 'inbound' ? Array.from(detectedClusterMap.keys()) : [],
      matchedSpans: direction === 'inbound' ? matchedSpans : [],
      detectedLanguage,
      isMixedLanguage,
      requestFrames: direction === 'inbound' ? requestFrames : [],
    });

    if (this.messages.filter((message) => message.direction === direction).length > this.MAX_MESSAGES_PER_DIRECTION) {
      const oldestIndex = this.messages.findIndex((message) => message.direction === direction);
      this.messages.splice(oldestIndex, 1);
    }

    // Outbound messages preserve dialogue history but cannot contribute evidence
    // or refresh the timestamp/language of the latest interlocutor message.
    const inboundMessages = this.messages.filter((message) => message.direction === 'inbound');
    const latestInbound = inboundMessages.at(-1);
    if (!latestInbound) {
      return { hasFormedIntent: false, matchedSpans: [], clustersDetected: [], normalizedText,
        detectedLanguage, isMixedLanguage, suspiciousUrls: [] };
    }
    rawText = latestInbound.rawText;

    // 3. Aggregate only interlocutor evidence with a per-message recency weight.
    const aggregatedClusterMap = new Map<string, number>();
    const aggregatedSpans: IntentMatchSpan[] = [];
    const now = Date.now();
    
    for (const msg of inboundMessages) {
      for (const span of msg.matchedSpans) {
        const weight = (span.weight ?? 35) * this.recencyWeight(msg.timestamp, now);
        aggregatedSpans.push({ ...span, weight });
        const currentMax = aggregatedClusterMap.get(span.cluster) || 0;
        aggregatedClusterMap.set(span.cluster, Math.max(currentMax, weight));
      }
    }

    const activeClusters = Array.from(aggregatedClusterMap.keys());

    // 4. Evaluate stateful intent via heuristic clusters
    const heuristicResult = IntentClassifier.evaluateStatefulIntent(
      activeClusters,
      aggregatedClusterMap,
      aggregatedSpans,
      rawText,
      latestInbound.detectedLanguage,
      latestInbound.isMixedLanguage,
      latestInbound.clusters
    );

    // 5. Tier 1.5: Семантичний векторний аналіз (Semantic & Behavioral Intent Trigger)
    // Завжди обчислюємо векторний спектр для кожного повідомлення для актуальної телеметрії
    const inboundEvidence = inboundMessages.map((message) => ({
      text: message.rawText,
      weight: this.recencyWeight(message.timestamp, now),
    }));
    const inboundDialogueContext = inboundMessages.map((message) => `[Співрозмовник]: ${message.rawText}`).join('\n');
    const latestClusterMap = new Map(latestInbound.matchedSpans.map((span) => [span.cluster, span.weight ?? 35]));
    // A conceptual resemblance to a banking message must not manufacture an
    // explicit secret request that the lexical analysis rejected (e.g. advice).
    const hasCredentialRequest = latestClusterMap.has('payment_credential_request') ||
      latestClusterMap.has('password_theft') ||
      (latestClusterMap.has('bank_login_request') && latestClusterMap.has('action_link') &&
       latestClusterMap.has('payment_purpose'));
    const mentionsCredential = /(?:[cс]vv|[cс]v[cс]|\bpin\b|код|парол|password|passcode|\botp\b|баланс|balance|реквізит|ключ|фраз|phrase|security\s+code)/iu.test(rawText);
    const isCredentialAdvice = /(?:не\s+(?:надсилайте|повідомляйте|передавайте|вводьте|надавайте|сообщайте|отправляйте|передавайте)|never\s+(?:send|share|provide)|do\s+not\s+(?:send|share|provide))/iu.test(rawText);
    const isSelfServiceBalanceCheck = /перевір[а-яіїє]*\s+баланс\s+самостійно/iu.test(rawText);
    const isCompletedVerification = /(?:перевірено|підтверджено|проверен[ао]?|подтвержден[ао]?|\bverified\b|\bconfirmed\b)/iu.test(rawText);
    // Keep semantic coverage for unlisted request paraphrases; reject clear
    // advice/status messages rather than demanding one exact lexical template.
    const credentialEvidence = hasCredentialRequest ? true
      : ((!mentionsCredential && isCompletedVerification) || isCredentialAdvice || isSelfServiceBalanceCheck) ? false : undefined;
    const semanticResult = SemanticTriggerEngine.evaluate(rawText, inboundDialogueContext, credentialEvidence, inboundEvidence);

    if (heuristicResult.hasFormedIntent) {
      return {
        ...heuristicResult,
        requestFrames: latestInbound.requestFrames ?? [],
        telemetry: semanticResult.telemetry,
      };
    }

    if (semanticResult.hasFormedIntent) {
      const semanticSpans: IntentMatchSpan[] = semanticResult.matchedKeywords.map((kw) => ({
        cluster: 'semantic_trigger',
        text: kw,
        start: 0,
        end: kw.length,
      }));

      return {
        hasFormedIntent: true,
        requestFrames: latestInbound.requestFrames ?? [],
        intentType: semanticResult.intentType as ScamIntentType,
        intentTitle: semanticResult.intentTitle,
        confidence: semanticResult.confidence,
        clustersDetected: ['semantic_trigger', ...activeClusters],
        matchedSpans: semanticSpans.length > 0 ? semanticSpans : aggregatedSpans,
        detectedLanguage: latestInbound.detectedLanguage,
        isMixedLanguage: latestInbound.isMixedLanguage,
        normalizedText: latestInbound.normalizedText,
        suspiciousUrls: heuristicResult.suspiciousUrls || [],
        telemetry: semanticResult.telemetry,
      };
    }

    return {
      ...heuristicResult,
      requestFrames: latestInbound.requestFrames ?? [],
      telemetry: semanticResult.telemetry,
    };
  }

  public static clear() {
    this.reset();
  }

  private static cleanExpired() {
    const now = Date.now();
    this.messages = this.messages.filter(m => now >= m.timestamp && now - m.timestamp < this.TIMEOUT_MS);
  }

  private static recencyWeight(timestamp: number, now: number): number {
    const age = Math.max(0, now - timestamp);
    return Math.pow(2, -Math.max(0, age - this.FULL_WEIGHT_MS) / this.HALF_LIFE_MS);
  }
}
