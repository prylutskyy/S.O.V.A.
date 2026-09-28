import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloudLLMDispatcher } from '../../../src/ai/cloud/cloud-llm-dispatcher';
import { SecureKeyStore } from '../../../src/core/secure-key-store';
import { GeminiDriver } from '../../../src/ai/cloud/drivers/gemini-driver';
import { OpenAIDriver } from '../../../src/ai/cloud/drivers/openai-driver';
import { GroqDriver } from '../../../src/ai/cloud/drivers/groq-driver';

describe('CloudLLMDispatcher & Drivers (TDD Suite)', () => {
  beforeEach(() => {
    SecureKeyStore.clearMemory();
    vi.restoreAllMocks();
  });

  describe('GeminiDriver', () => {
    it('should format request and parse JSON threat verdict', async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    isScam: true,
                    confidence: 94,
                    scamType: 'ESCROW_DELIVERY_FRAUD',
                    reasoning: 'Фішингове посилання під виглядом безпечної угоди',
                  }),
                },
              ],
            },
          },
        ],
      };

      // @ts-ignore
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const driver = new GeminiDriver();
      const res = await driver.verifyThreat({
        provider: 'gemini',
        apiKey: 'AIzaSy_fake_test_key',
        sanitizedPrompt: 'Test sanitized prompt with [VERIFIED_CARD_NUMBER_1]',
        model: 'gemini-2.5-flash',
      });

      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (fetch as any).mock.calls[0];
      expect(url).toContain('gemini-2.5-flash:generateContent');
      expect(url).toContain('key=AIzaSy_fake_test_key');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.contents[0].parts[0].text).toContain('[VERIFIED_CARD_NUMBER_1]');
      expect(body.generationConfig.responseMimeType).toBe('application/json');

      expect(res.isScam).toBe(true);
      expect(res.confidence).toBe(94);
      expect(res.scamType).toBe('ESCROW_DELIVERY_FRAUD');
      expect(res.reasoning).toContain('Фішингове посилання');
      expect(res.provider).toBe('gemini');
    });
  });

  describe('OpenAIDriver', () => {
    it('should send Bearer token and parse response_format json_object', async () => {
      const mockReply = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                isScam: false,
                confidence: 88,
                reasoning: 'Звичайна розмова покупця без шкідливих посилань',
              }),
            },
          },
        ],
      };

      // @ts-ignore
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockReply,
      });

      const driver = new OpenAIDriver();
      const res = await driver.verifyThreat({
        provider: 'openai',
        apiKey: 'sk-proj-test-1234',
        sanitizedPrompt: 'Clean dialogue',
        model: 'gpt-4o-mini',
      });

      const [url, options] = (fetch as any).mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(options.headers.Authorization).toBe('Bearer sk-proj-test-1234');

      expect(res.isScam).toBe(false);
      expect(res.confidence).toBe(88);
      expect(res.reasoning).toContain('Звичайна розмова');
    });
  });

  describe('GroqDriver', () => {
    it('should target Groq endpoint with llama-3.3-70b-versatile', async () => {
      const mockReply = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                isScam: true,
                confidence: 98,
                scamType: 'CREDENTIAL_THEFT',
                reasoning: 'Спроба викрадення секретного коду CVV',
              }),
            },
          },
        ],
      };

      // @ts-ignore
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockReply,
      });

      const driver = new GroqDriver();
      const res = await driver.verifyThreat({
        provider: 'groq',
        apiKey: 'gsk_groq_test_key',
        sanitizedPrompt: 'Dialogue with [VERIFIED_CVV_CODE]',
      });

      const [url, options] = (fetch as any).mock.calls[0];
      expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(options.headers.Authorization).toBe('Bearer gsk_groq_test_key');
      expect(res.isScam).toBe(true);
      expect(res.confidence).toBe(98);
      expect(res.provider).toBe('groq');
    });
  });

  describe('CloudLLMDispatcher Workflow', () => {
    it('should return null when not configured or disabled', async () => {
      await SecureKeyStore.saveConfig({ enabled: false });
      const isReady = await CloudLLMDispatcher.isConfigured();
      expect(isReady).toBe(false);

      const res = await CloudLLMDispatcher.verifyThreat('prompt');
      expect(res).toBeNull();
    });

    it('should dispatch to configured provider and return response', async () => {
      await SecureKeyStore.saveConfig({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        enabled: true,
      });
      await SecureKeyStore.saveApiKey('gemini', 'test_key', 'device_encrypted');

      // @ts-ignore
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ isScam: true, confidence: 91, reasoning: 'Загроза підтверджена' }) }],
              },
            },
          ],
        }),
      });

      const res = await CloudLLMDispatcher.verifyThreat('Sanitized [VERIFIED_CARD_NUMBER_1]');
      expect(res).not.toBeNull();
      expect(res?.isScam).toBe(true);
      expect(res?.confidence).toBe(91);
      expect(res?.provider).toBe('gemini');
    });

    it('should generate simulated chat reply via configured cloud provider', async () => {
      await SecureKeyStore.saveConfig({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        enabled: true,
      });
      await SecureKeyStore.saveApiKey('gemini', 'test_key', 'device_encrypted');

      // @ts-ignore
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: '[Співрозмовник]: Доброго дня! Я вже оплатив доставку, ось лінк: https://olx.fake' }],
              },
            },
          ],
        }),
      });

      const replyResult = await CloudLLMDispatcher.generateChatReply(
        'SCAMMER_ESCROW',
        [],
        'Чи актуально?',
        'Ноутбук'
      );

      expect(replyResult).not.toBeNull();
      expect(replyResult?.reply).toBe('Доброго дня! Я вже оплатив доставку, ось лінк: https://olx.fake');
      expect(replyResult?.engine).toContain('cloud-gemini');
    });

    it('should test connection successfully with gemini-3.8-flash', async () => {
      // @ts-ignore
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'OK' }] } }],
        }),
      });

      const res = await CloudLLMDispatcher.testConnection('gemini', 'test_key', 'gemini-3.8-flash');
      expect(res.success).toBe(true);
      expect(res.modelUsed).toBe('gemini-3.8-flash');
      const [url] = (fetch as any).mock.calls[0];
      expect(url).toContain('gemini-3.8-flash:generateContent');
    });

    it('should fallback to next candidate model if 404 is encountered during testConnection', async () => {
      let callCount = 0;
      // @ts-ignore
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        callCount++;
        if (url.includes('gemini-2.5-flash')) {
          return {
            ok: false,
            status: 404,
            json: async () => ({ error: { message: 'models/gemini-2.5-flash is no longer available' } }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }),
        };
      });

      const res = await CloudLLMDispatcher.testConnection('gemini', 'test_key', 'gemini-2.5-flash');
      expect(res.success).toBe(true);
      expect(res.modelUsed).toBe('gemini-3.8-flash');
      expect(callCount).toBeGreaterThanOrEqual(2);
    });
  });
});
