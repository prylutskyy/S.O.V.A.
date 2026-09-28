import { LLMProviderType, SecureKeyStore, LLMConfig } from '../../core/secure-key-store';
import { ICloudLLMDriver, CloudVerificationRequest, CloudVerificationResponse } from './types';
import { GeminiDriver } from './drivers/gemini-driver';
import { OpenAIDriver } from './drivers/openai-driver';
import { GroqDriver } from './drivers/groq-driver';

export class CloudLLMDispatcher {
  private static drivers: Map<LLMProviderType, ICloudLLMDriver> = new Map([
    ['gemini', new GeminiDriver()],
    ['openai', new OpenAIDriver()],
    ['custom_openai', new OpenAIDriver()],
    ['groq', new GroqDriver()],
  ]);

  /**
   * Чи налаштовано і увімкнено хмарний ШІ в системі
   */
  public static async isConfigured(): Promise<boolean> {
    const config = await SecureKeyStore.getConfig();
    if (!config.enabled) return false;
    const key = await SecureKeyStore.getApiKey(config.provider);
    return !!key;
  }

  /**
   * Головний метод відправки деанонімізованого запиту до хмарного ШІ
   */
  public static async verifyThreat(
    sanitizedPrompt: string,
    overrideConfig?: Partial<LLMConfig>,
    signal?: AbortSignal
  ): Promise<CloudVerificationResponse | null> {
    const config = await SecureKeyStore.getConfig();
    const effectiveConfig = { ...config, ...overrideConfig };

    const apiKey = await SecureKeyStore.getApiKey(effectiveConfig.provider);
    if (!apiKey) {
      console.warn(`[ThreatShield:CloudAI] API-ключ для провайдера ${effectiveConfig.provider} не знайдено.`);
      return null;
    }

    const driver = this.drivers.get(effectiveConfig.provider);
    if (!driver) {
      throw new Error(`Непідтримуваний провайдер LLM: ${effectiveConfig.provider}`);
    }

    const timeoutMs = effectiveConfig.timeoutMs || 3000;
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    let combinedSignal = timeoutController.signal;
    if (signal) {
      signal.addEventListener('abort', () => timeoutController.abort(), { once: true });
    }

    try {
      const request: CloudVerificationRequest = {
        provider: effectiveConfig.provider,
        sanitizedPrompt,
        apiKey,
        model: effectiveConfig.model,
        customBaseUrl: effectiveConfig.customBaseUrl,
        timeoutMs,
        signal: combinedSignal,
      };

      const result = await driver.verifyThreat(request);
      return result;
    } catch (err: any) {
      if (err?.name === 'AbortError' || combinedSignal.aborted) {
        console.warn(`[ThreatShield:CloudAI] Запит до ${effectiveConfig.provider} перервано за таймаутом (${timeoutMs} мс).`);
      } else {
        console.error(`[ThreatShield:CloudAI] Помилка інференсу ${effectiveConfig.provider}:`, err);
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
