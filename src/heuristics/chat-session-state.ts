import { IntentMatchSpan, IntentClassifier, IntentClassificationResult, ScamIntentType } from './intent-classifier';
import { SemanticTriggerEngine } from './semantic-trigger';

export interface ChatMessageContext {
  id: string;
  rawText: string;
  normalizedText: string;
  timestamp: number;
  direction: 'inbound' | 'outbound';
  clusters: string[];
  matchedSpans: IntentMatchSpan[];
}

export class ChatSessionState {
  private static messages: ChatMessageContext[] = [];
  private static readonly MAX_MESSAGES = 30;
  private static readonly TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

  // Керування станом перевірки ШІ (Карантин / Імунітет)
  public static sessionLlmVerdict: 'SCAM' | 'SAFE' | null = null;
  public static sessionLlmImmunityPeakScore: number = 0;

  public static reset() { 
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
    const { matchedSpans, detectedClusterMap, normalizedText, detectedLanguage, isMixedLanguage } = IntentClassifier.extractClusters(rawText);

    // 2. Save it to state
    this.messages.push({
      id: Math.random().toString(36).substring(7),
      rawText,
      normalizedText,
      timestamp: Date.now(),
      direction,
      clusters: Array.from(detectedClusterMap.keys()),
      matchedSpans
    });

    if (this.messages.length > this.MAX_MESSAGES) {
      this.messages.shift();
    }

    // 3. Aggregate all clusters from the sliding window
    const aggregatedClusterMap = new Map<string, number>();
    const aggregatedSpans: IntentMatchSpan[] = [];
    
    for (const msg of this.messages) {
      for (const span of msg.matchedSpans) {
        aggregatedSpans.push(span);
        const currentMax = aggregatedClusterMap.get(span.cluster) || 0;
        aggregatedClusterMap.set(span.cluster, Math.max(currentMax, span.weight ?? 35));
      }
    }

    const activeClusters = Array.from(aggregatedClusterMap.keys());

    // 4. Evaluate stateful intent via heuristic clusters
    const heuristicResult = IntentClassifier.evaluateStatefulIntent(
      activeClusters,
      aggregatedClusterMap,
      aggregatedSpans,
      rawText,
      detectedLanguage,
      isMixedLanguage,
      Array.from(detectedClusterMap.keys())
    );

    // 5. Tier 1.5: Семантичний векторний аналіз (Semantic & Behavioral Intent Trigger)
    // Завжди обчислюємо векторний спектр для кожного повідомлення для актуальної телеметрії
    const fullDialogueContext = this.getDialogueHistory();
    // A conceptual resemblance to a banking message must not manufacture an
    // explicit secret request that the lexical analysis rejected (e.g. advice).
    const hasCredentialRequest = detectedClusterMap.has('payment_credential_request') ||
      detectedClusterMap.has('password_theft') ||
      (detectedClusterMap.has('bank_login_request') && detectedClusterMap.has('action_link') &&
       detectedClusterMap.has('payment_purpose'));
    const mentionsCredential = /(?:[cс]vv|[cс]v[cс]|\bpin\b|код|парол|password|passcode|\botp\b|баланс|balance|реквізит|ключ|фраз|phrase|security\s+code)/iu.test(rawText);
    const isCredentialAdvice = /(?:не\s+(?:надсилайте|повідомляйте|передавайте|вводьте|надавайте|сообщайте|отправляйте|передавайте)|never\s+(?:send|share|provide)|do\s+not\s+(?:send|share|provide))/iu.test(rawText);
    const isSelfServiceBalanceCheck = /перевір[а-яіїє]*\s+баланс\s+самостійно/iu.test(rawText);
    const isCompletedVerification = /(?:перевірено|підтверджено|проверен[ао]?|подтвержден[ао]?|\bverified\b|\bconfirmed\b)/iu.test(rawText);
    // Keep semantic coverage for unlisted request paraphrases; reject clear
    // advice/status messages rather than demanding one exact lexical template.
    const credentialEvidence = hasCredentialRequest ? true
      : ((!mentionsCredential && isCompletedVerification) || isCredentialAdvice || isSelfServiceBalanceCheck) ? false : undefined;
    const semanticResult = SemanticTriggerEngine.evaluate(rawText, fullDialogueContext, credentialEvidence);

    if (heuristicResult.hasFormedIntent) {
      return {
        ...heuristicResult,
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
        intentType: semanticResult.intentType as ScamIntentType,
        intentTitle: semanticResult.intentTitle,
        confidence: semanticResult.confidence,
        clustersDetected: ['semantic_trigger', ...activeClusters],
        matchedSpans: semanticSpans.length > 0 ? semanticSpans : aggregatedSpans,
        detectedLanguage: detectedLanguage || 'uk',
        isMixedLanguage,
        normalizedText,
        suspiciousUrls: heuristicResult.suspiciousUrls || [],
        telemetry: semanticResult.telemetry,
      };
    }

    return {
      ...heuristicResult,
      telemetry: semanticResult.telemetry,
    };
  }

  public static clear() {
    this.messages = [];
    this.sessionLlmVerdict = null;
    this.sessionLlmImmunityPeakScore = 0;
  }

  private static cleanExpired() {
    const now = Date.now();
    this.messages = this.messages.filter(m => now - m.timestamp < this.TIMEOUT_MS);
  }
}
