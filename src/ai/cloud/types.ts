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
  requestMessages?: { role: string; content: string }[];
}

export interface CloudTextGenerationRequest {
  provider: LLMProviderType;
  userPrompt: string;
  systemPrompt?: string;
  apiKey: string;
  model?: string;
  customBaseUrl?: string;
  temperature?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface CloudTextGenerationResponse {
  text: string;
  latencyMs: number;
  provider: LLMProviderType;
  modelUsed: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  description?: string;
}

export interface ICloudLLMDriver {
  verifyThreat(request: CloudVerificationRequest): Promise<CloudVerificationResponse>;
  generateText?(request: CloudTextGenerationRequest): Promise<CloudTextGenerationResponse>;
  listModels?(apiKey: string, customBaseUrl?: string): Promise<ModelInfo[]>;
}
