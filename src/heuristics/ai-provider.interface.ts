export interface AIValidationResult {
  isScam: boolean;
  confidence: number;
  reasoning: string;
  scamType?: string;
  rawResponse?: string;
}

export interface AIHeuristicContext {
  detectedKeywords: string[];
  suspiciousUrls: string[];
  intentType: string;
  nlpConfidence: number;
  triggeredClusters: string[];
  raisedFlags?: string[];
  formDetails?: string;
  sourcePlatform?: string;
  targetHost?: string;
  chatDialogue?: string;
}

export interface IAIProvider {
  /**
   * Перевіряє доступність локального AI (Gemini Nano)
   */
  isAvailable(): Promise<boolean>;

  /**
   * Аналізує текст на наявність маніпуляцій з урахуванням виявленого контексту.
   */
  verifyIntent(text: string, contextRules: string, triggerWord?: string, heuristicContext?: AIHeuristicContext): Promise<AIValidationResult | null>;
}
