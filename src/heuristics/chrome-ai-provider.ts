import { IAIProvider, AIValidationResult } from './ai-provider.interface';
import '../types/ai.d.ts';

export class ChromeBuiltinAIProvider implements IAIProvider {
  public async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined' || !window.ai || !window.ai.languageModel) {
      return false;
    }
    try {
      const capabilities = await window.ai.languageModel.capabilities();
      return capabilities.available === 'readily' || capabilities.available === 'after-download';
    } catch {
      return false;
    }
  }

  public async verifyIntent(text: string, contextRules: string): Promise<AIValidationResult | null> {
    if (!(await this.isAvailable())) {
      return null;
    }

    let session;
    try {
      session = await window.ai!.languageModel!.create({
        systemPrompt: `You are a cybersecurity AI analyzing a chat message for social engineering or scams.
Follow these rules strictly:
1. You must respond ONLY with a valid JSON object. Do not include markdown code blocks (\`\`\`json).
2. The JSON format must be exactly: {"isScam": boolean, "confidence": number, "reasoning": "string"}
3. Confidence is 0-100.
Context of the scam we are looking for: ${contextRules}`,
        temperature: 0.1, // low temp for deterministic JSON output
      });

      const prompt = `Analyze this message and return the JSON: "${text}"`;
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
