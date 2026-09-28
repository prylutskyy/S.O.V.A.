import { LLMProviderType } from '../../core/secure-key-store';

export interface CloudVerificationRequest {
  provider: LLMProviderType;
  sanitizedPrompt: string;
  apiKey: string;
  model?: string;
  customBaseUrl?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface CloudVerificationResponse {
  isScam: boolean;
  confidence: number;
  scamType?: string;
  reasoning: string;
  rawResponse?: string;
  latencyMs: number;
  provider: LLMProviderType;
  modelUsed: string;
}

export interface ICloudLLMDriver {
  verifyThreat(request: CloudVerificationRequest): Promise<CloudVerificationResponse>;
}
