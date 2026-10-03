import { IntentMatchSpan, IntentClassifier, IntentClassificationResult } from './intent-classifier';
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
        aggregatedClusterMap.set(span.cluster, Math.max(currentMax, 35)); // Use default weight or real weight if available
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
      isMixedLanguage
    );

    if (heuristicResult.hasFormedIntent) {
      return heuristicResult;
    }

    // 5. Tier 1.5: Семантичний векторний аналіз (Semantic & Behavioral Intent Trigger)
    // Якщо класичні регулярні вирази не вловили загрозу, перевіряємо через векторний простір та матрицю намірів
    const fullDialogueContext = this.getDialogueHistory();
    const semanticResult = SemanticTriggerEngine.evaluate(rawText, fullDialogueContext);

    if (semanticResult.hasFormedIntent) {
      const semanticSpans: IntentMatchSpan[] = semanticResult.matchedKeywords.map((kw) => ({
        cluster: 'semantic_trigger',
        text: kw,
        startIndex: 0,
        endIndex: kw.length,
      }));

      return {
        hasFormedIntent: true,
        intentType: semanticResult.intentType,
        intentTitle: semanticResult.intentTitle,
        confidence: semanticResult.confidence,
        clustersDetected: ['semantic_trigger', ...activeClusters],
        matchedSpans: semanticSpans.length > 0 ? semanticSpans : aggregatedSpans,
        detectedLanguage: detectedLanguage || 'uk',
        isMixedLanguage,
        normalizedText,
        suspiciousUrls: heuristicResult.suspiciousUrls || [],
      };
    }

    return heuristicResult;
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
