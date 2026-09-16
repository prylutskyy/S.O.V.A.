import { IntentMatchSpan, IntentClassifier, IntentClassificationResult } from './intent-classifier';

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
  private static readonly MAX_MESSAGES = 5;
  private static readonly TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

  public static addMessageAndEvaluate(
    rawText: string,
    direction: 'inbound' | 'outbound'
  ): IntentClassificationResult {
    this.cleanExpired();

    // 1. Extract clusters for the current message
    const { matchedSpans, detectedClusterMap, normalizedText } = IntentClassifier.extractClusters(rawText);

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

    // 4. Evaluate stateful intent
    return IntentClassifier.evaluateStatefulIntent(
      activeClusters,
      aggregatedClusterMap,
      aggregatedSpans,
      rawText
    );
  }

  public static clear() {
    this.messages = [];
  }

  private static cleanExpired() {
    const now = Date.now();
    this.messages = this.messages.filter(m => now - m.timestamp < this.TIMEOUT_MS);
  }
}
