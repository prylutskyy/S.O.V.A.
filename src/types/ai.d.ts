export interface AICapabilities {
  available: 'no' | 'readily' | 'after-download';
}

export interface AISession {
  prompt(text: string): Promise<string>;
  destroy(): void;
}

export interface AICreateOptions {
  systemPrompt?: string;
  temperature?: number;
  topK?: number;
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
