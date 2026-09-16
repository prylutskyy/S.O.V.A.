export interface AIValidationResult {
  isScam: boolean;
  confidence: number;
  reasoning: string;
}

export interface IAIProvider {
  /**
   * Перевіряє доступність локального AI (Gemini Nano)
   */
  isAvailable(): Promise<boolean>;

  /**
   * Аналізує текст на наявність маніпуляцій з урахуванням виявленого контексту.
   */
  verifyIntent(text: string, contextRules: string, triggerWord?: string): Promise<AIValidationResult | null>;
}
