export interface AIValidationResult {
  isScam: boolean;
  confidence: number;
  reasoning: string;
}

export interface IAIProvider {
  isAvailable(): Promise<boolean>;
  verifyIntent(text: string, contextRules: string): Promise<AIValidationResult | null>;
}
