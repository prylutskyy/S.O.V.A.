export interface AICapabilities {
  available: 'no' | 'readily' | 'after-download';
}

export interface AIPromptOptions {
  signal?: AbortSignal;
}

export interface AISession {
  prompt(text: string, options?: AIPromptOptions): Promise<string>;
  destroy(): void;
}

export interface AICreateOptions {
  systemPrompt?: string;
  temperature?: number;
  topK?: number;
  signal?: AbortSignal;
}

export interface AILanguageModel {
  capabilities(): Promise<AICapabilities>;
  create(options?: AICreateOptions): Promise<AISession>;
}

declare global {
  interface Window {
    ai?: {
      languageModel?: AILanguageModel;
    };
  }
}
