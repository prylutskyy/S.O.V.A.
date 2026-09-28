import { LLMProviderType, SecureKeyStore, LLMConfig } from '../../core/secure-key-store';
import { ICloudLLMDriver, CloudVerificationRequest, CloudVerificationResponse } from './types';
import { GeminiDriver } from './drivers/gemini-driver';
import { OpenAIDriver } from './drivers/openai-driver';
import { GroqDriver } from './drivers/groq-driver';
import { SimulatorPersona, DialogueMessage, ChatSimulatorEngine } from '../../heuristics/chat-simulator';

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
    if (!config.enabled) {
      console.log('[ThreatShield:CloudAI] isConfigured: false (config.enabled is false)');
      return false;
    }
    const key = await SecureKeyStore.getApiKey(config.provider);
    const hasKey = !!key;
    console.log(`[ThreatShield:CloudAI] isConfigured: ${hasKey} (provider: ${config.provider}, model: ${config.model}, hasKey: ${hasKey})`);
    return hasKey;
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

  /**
   * Генерація динамічної репліки співрозмовника-шахрая в симуляторі чату через хмарну LLM
   */
  public static async generateChatReply(
    persona: SimulatorPersona,
    history: DialogueMessage[],
    latestUserMessage?: string,
    itemContext?: string,
    customGoal?: string,
    signal?: AbortSignal
  ): Promise<{ reply: string; engine: string; latencyMs: number } | null> {
    const config = await SecureKeyStore.getConfig();
    if (!config.enabled) return null;

    const apiKey = await SecureKeyStore.getApiKey(config.provider);
    if (!apiKey) return null;

    const driver = this.drivers.get(config.provider);
    if (!driver || typeof driver.generateText !== 'function') return null;

    const systemPrompt = ChatSimulatorEngine.buildSystemPrompt(persona, itemContext, customGoal);
    const fullPrompt = ChatSimulatorEngine.buildPromptWithHistory(persona, history, latestUserMessage, itemContext, customGoal);

    const timeoutMs = Math.max(config.timeoutMs || 4000, 6000);
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    let combinedSignal = timeoutController.signal;
    if (signal) {
      signal.addEventListener('abort', () => timeoutController.abort(), { once: true });
    }

    try {
      const response = await driver.generateText({
        provider: config.provider,
        userPrompt: fullPrompt,
        systemPrompt,
        apiKey,
        model: config.model,
        customBaseUrl: config.customBaseUrl,
        temperature: 0.7,
        timeoutMs,
        signal: combinedSignal,
      });

      let reply = (response.text || '')
        .replace(/^\[(?:Співрозмовник|Покупець|Шахрай|Продавець|Клієнт)\]:\s*/i, '')
        .replace(/^["'«»]|["'«»]$/g, '')
        .trim();

      if (!reply || /as an ai|cannot fulfill|safety guidelines|unable to/i.test(reply)) {
        return null;
      }

      return {
        reply,
        engine: `cloud-${config.provider} (${response.modelUsed})`,
        latencyMs: response.latencyMs,
      };
    } catch (e) {
      console.warn(`[ThreatShield:CloudAI] Помилка генерації репліки симулятора через ${config.provider}:`, e);
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Пряма перевірка валідності API ключа та зв'язку з обраним провайдером
   */
  public static async testConnection(
    provider: LLMProviderType,
    customApiKey?: string,
    model?: string
  ): Promise<{ success: boolean; modelUsed?: string; latencyMs?: number; error?: string }> {
    const key = customApiKey || (await SecureKeyStore.getApiKey(provider));
    if (!key) {
      return { success: false, error: 'API-ключ не знайдено або не вказано' };
    }

    if (provider === 'gemini') {
      return GeminiDriver.testKey(key, model || 'gemini-3.8-flash');
    }

    const driver = this.drivers.get(provider);
    if (!driver || typeof driver.generateText !== 'function') {
      return { success: false, error: `Провайдер ${provider} не підтримується для тестування` };
    }

    try {
      const res = await driver.generateText({
        provider,
        userPrompt: 'Ping. Respond with OK.',
        apiKey: key,
        model: model || (provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini'),
        temperature: 0.1,
        timeoutMs: 5000,
      });
      return { success: true, modelUsed: res.modelUsed, latencyMs: res.latencyMs };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }
}
