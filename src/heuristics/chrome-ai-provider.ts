import { IAIProvider, AIValidationResult } from './ai-provider.interface';
import '../types/ai.d.ts';

export class ChromeBuiltinAIProvider implements IAIProvider {
  private getProvider(): any {
    if (typeof window === 'undefined') return null;
    if ((window as any).LanguageModel) return (window as any).LanguageModel;
    if ((window as any).ai?.languageModel) return (window as any).ai.languageModel;
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

  public async verifyIntent(text: string, contextRules: string): Promise<AIValidationResult | null> {
    const provider = this.getProvider();
    if (!provider || !(await this.isAvailable())) {
      return null;
    }

    let session;
    try {
      try {
        session = await provider.create({
          systemPrompt: `You are a cybersecurity AI analyzing a chat message for social engineering or scams.
Follow these rules strictly:
1. You must respond ONLY with a valid JSON object. Do not include markdown code blocks (\`\`\`json).
2. The JSON format must be exactly: {"isScam": boolean, "confidence": number, "reasoning": "string"}
3. Confidence is 0-100.
Context of the scam we are looking for: ${contextRules}`,
          temperature: 0.1,
        });
      } catch (e) {
        console.warn('[ThreatShield:AI] create(options) failed, trying create() without options...', e);
        session = await provider.create();
      }

      const prompt = `System Instructions: You are a cybersecurity AI analyzing a chat message for social engineering or scams.
Strict Rules:
1. You must respond ONLY with a valid JSON object. Do not include markdown code blocks.
2. The JSON format must be exactly: {"isScam": boolean, "confidence": number, "reasoning": "string"}
3. Confidence is 0-100.
Context of the scam we are looking for: ${contextRules}

User Message to Analyze: "${text}"`;
      const responseText = await session.prompt(prompt);
      
      // Attempt to parse JSON safely
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      
      return {
        isScam: !!parsed.isScam,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 50,
        reasoning: parsed.reasoning || 'No reasoning provided',
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
