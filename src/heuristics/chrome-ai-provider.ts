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
          systemPrompt: `You are a cybersecurity expert analyzing chat messages from Ukrainian marketplaces (OLX, Prom) or social networks.
Your goal is to detect social engineering, phishing, and payment scams.
Answer ONLY in valid JSON format.
Required JSON schema:
{
  "isScam": boolean,
  "confidence": number (0-100),
  "reasoning": string (in Ukrainian, max 2 sentences explaining why)
}`,
          temperature: 0.1,
        };
        if (this.abortSignal) createOptions.signal = this.abortSignal;
        
        session = await provider.create(createOptions);
      } catch (e) {
        if (this.abortSignal?.aborted) throw e;
        console.warn('[ThreatShield:AI] create(options) failed, falling back to empty create()...', e);
        session = await provider.create();
      }

      let truncatedText = text;
      const MAX_LEN = 300;
      if (text.length > MAX_LEN) {
        if (triggerWord && text.includes(triggerWord)) {
          const triggerIndex = text.indexOf(triggerWord);
          const start = Math.max(0, triggerIndex - Math.floor(MAX_LEN / 2));
          const end = Math.min(text.length, start + MAX_LEN);
          truncatedText = (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
        } else {
          truncatedText = text.substring(0, MAX_LEN) + '...';
        }
      }

      const prompt = `Analyze this message.
Specific context/rules to consider: ${contextRules}
Message to analyze: "${truncatedText}"
Respond ONLY with JSON.`;
      
      let responseText = '';
      try {
        responseText = await session.prompt(prompt, this.abortSignal ? { signal: this.abortSignal } : undefined);
      } catch (e) {
        if (this.abortSignal?.aborted) throw e;
        console.warn('[ThreatShield:AI] session.prompt(options) failed, trying without options...', e);
        responseText = await session.prompt(prompt);
      }
      
      let cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      let parsed: any = { isScam: false, confidence: 0, reasoning: 'Не вдалося розпарсити відповідь ШІ.' };
      
      try {
        const firstBrace = cleanJson.indexOf('{');
        const lastBrace = cleanJson.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
        }
        parsed = JSON.parse(cleanJson);
      } catch (parseError) {
        console.warn('[ThreatShield:AI] Failed to parse JSON. Text:', responseText);
        const lowerText = responseText.toLowerCase();
        if (lowerText.includes('"isscam": true') || lowerText.includes('"isscam":true')) {
          parsed.isScam = true;
          parsed.confidence = 80;
          parsed.reasoning = 'Виявлено ознаки шахрайства, але ШІ повернув невалідний формат.';
        }
      }
      
      return {
        isScam: parsed.isScam === true || String(parsed.isScam).toLowerCase() === 'true',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : (parsed.isScam ? 85 : 15),
        reasoning: parsed.reasoning || (parsed.isScam ? 'Повідомлення відповідає патернам соціальної інженерії.' : 'Повідомлення виглядає безпечним.')
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
