import { IAIProvider, AIValidationResult } from './ai-provider.interface';
import '../types/ai.d.ts';

export class ChromeBuiltinAIProvider implements IAIProvider {
  private abortSignal?: AbortSignal;

  constructor(signal?: AbortSignal) {
    this.abortSignal = signal;
  }

  private getProvider(): any {
    const globalObj = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self);
    if (!globalObj) return null;
    
    if ((globalObj as any).LanguageModel) return (globalObj as any).LanguageModel;
    if ((globalObj as any).ai?.languageModel) return (globalObj as any).ai.languageModel;
    return null;
  }

  public async isAvailable(): Promise<boolean> {
    const provider = this.getProvider();
    if (!provider) return false;
    
    try {
      if (typeof provider.capabilities === 'function') {
        const capabilities = await provider.capabilities();
        return capabilities?.available === 'readily' || capabilities?.available === 'after-download';
      }
      return typeof provider.create === 'function';
    } catch (e) {
      console.warn('[ThreatShield:AI] provider.capabilities() threw an error, falling back to create check:', e);
      return typeof provider.create === 'function';
    }
  }

  public async verifyIntent(text: string, contextRules: string, triggerWord?: string): Promise<AIValidationResult | null> {
    const provider = this.getProvider();
    if (!provider || !(await this.isAvailable())) {
      return null;
    }

    let session;
    try {
      try {
        const createOptions: any = {
          systemPrompt: `Answer ONLY with JSON {"isScam": true/false}. Is this an escrow/delivery scam?`,
          temperature: 0.1,
        };
        if (this.abortSignal) createOptions.signal = this.abortSignal;
        
        session = await provider.create(createOptions);
      } catch (e) {
        if (this.abortSignal?.aborted) throw e;
        session = await provider.create(this.abortSignal ? { signal: this.abortSignal } : undefined);
      }

      // 1. Інтелектуальне обрізання тексту (Sliding Window Truncation)
      let truncatedText = text;
      const MAX_LEN = 300;
      
      if (text.length > MAX_LEN) {
        if (triggerWord && text.includes(triggerWord)) {
          // Якщо ми знаємо тригерне слово, вирізаємо вікно навколо нього
          const triggerIndex = text.indexOf(triggerWord);
          const start = Math.max(0, triggerIndex - Math.floor(MAX_LEN / 2));
          const end = Math.min(text.length, start + MAX_LEN);
          truncatedText = (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
        } else {
          // Якщо тригер невідомий (або не знайдений), беремо перші 300 символів
          truncatedText = text.substring(0, MAX_LEN) + '...';
        }
      }

      // 2. Спартанський промпт
      const prompt = `Task: Analyze if this message is a scam.
Context to look for: ${contextRules}
Message: "${truncatedText}"`;
      
      const responseText = await session.prompt(prompt, this.abortSignal ? { signal: this.abortSignal } : undefined);
      
      // Attempt to parse JSON safely
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      
      return {
        isScam: parsed.isScam === true || String(parsed.isScam).toLowerCase() === 'true',
        confidence: parsed.isScam ? 90 : 10,
        reasoning: parsed.reasoning || (parsed.isScam ? 'Заблоковано ШІ' : 'Безпечно')
      };
    } catch (e) {
      console.error('[ThreatShield:AI] Помилка верифікації:', e);
      return null;
    } finally {
      if (session && typeof session.destroy === 'function') {
        session.destroy();
      }
    }
  }
}
