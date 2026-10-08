import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroqDriver } from '../../../src/ai/cloud/drivers/groq-driver';

describe('GroqDriver - Dedicated Unit Tests', () => {
  let driver: GroqDriver;

  beforeEach(() => {
    driver = new GroqDriver();
    vi.restoreAllMocks();
  });

  describe('verifyThreat', () => {
    it('dispatches request to Groq API with Bearer auth, json_object format, and temperature 0.1', async () => {
      const mockReply = JSON.stringify({
        isScam: true,
        confidence: 96,
        scamType: 'ESCROW_DELIVERY_SCAM',
        reasoning: 'Спроба перенаправлення на фішинговий платіжний вузол під виглядом доставки.',
      });

      // @ts-ignore
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: mockReply } }],
        }),
      });

      const res = await driver.verifyThreat({
        provider: 'groq',
        apiKey: 'gsk_test_api_key_123',
        sanitizedPrompt: 'User conversation asking for [VERIFIED_CVV_CODE]',
        model: 'llama-3.3-70b-versatile',
      });

      expect(fetch).toHaveBeenCalledTimes(1);
      const [endpoint, opts] = (fetch as any).mock.calls[0];

      expect(endpoint).toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Authorization']).toBe('Bearer gsk_test_api_key_123');
      expect(opts.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(opts.body);
      expect(body.model).toBe('llama-3.3-70b-versatile');
      expect(body.temperature).toBe(0.1);
      expect(body.response_format).toEqual({ type: 'json_object' });
      expect(body.messages[1].content).toContain('[VERIFIED_CVV_CODE]');

      expect(res.isScam).toBe(true);
      expect(res.confidence).toBe(96);
      expect(res.scamType).toBe('ESCROW_DELIVERY_SCAM');
      expect(res.reasoning).toContain('Спроба перенаправлення');
      expect(res.provider).toBe('groq');
      expect(res.modelUsed).toBe('llama-3.3-70b-versatile');
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('robustly parses JSON wrapped in markdown code blocks', async () => {
      const markdownJson = `\`\`\`json
{
  "isScam": false,
  "confidence": 10,
  "reasoning": "Звичайне безпечне листування без підозрілих дій."
}
\`\`\``;

      // @ts-ignore
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: markdownJson } }],
        }),
      });

      const res = await driver.verifyThreat({
        provider: 'groq',
        apiKey: 'gsk_key',
        sanitizedPrompt: 'Friendly chat',
      });

      expect(res.isScam).toBe(false);
      expect(res.confidence).toBe(10);
      expect(res.reasoning).toContain('Звичайне безпечне листування');
    });

    it('throws descriptive error when Groq API returns non-ok status (e.g. 429 Rate Limit)', async () => {
      // @ts-ignore
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          error: { message: 'Rate limit reached for requests per minute' },
        }),
      });

      await expect(
        driver.verifyThreat({
          provider: 'groq',
          apiKey: 'gsk_key',
          sanitizedPrompt: 'Test',
        })
      ).rejects.toThrow('Rate limit reached for requests per minute');
    });

    it('propagates AbortSignal for early cancellation', async () => {
      const controller = new AbortController();
      controller.abort();

      // @ts-ignore
      globalThis.fetch = vi.fn().mockImplementation((_url, opts) => {
        if (opts.signal?.aborted) {
          return Promise.reject(new Error('The user aborted a request.'));
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      await expect(
        driver.verifyThreat({
          provider: 'groq',
          apiKey: 'gsk_key',
          sanitizedPrompt: 'Test',
          signal: controller.signal,
        })
      ).rejects.toThrow('aborted');
    });
  });

  describe('generateText', () => {
    it('sends text generation request and returns trimmed response', async () => {
      // @ts-ignore
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '  Доброго дня! Чим можу допомогти?  ' } }],
        }),
      });

      const res = await driver.generateText({
        provider: 'groq',
        apiKey: 'gsk_key',
        systemPrompt: 'You are a seller assistant',
        userPrompt: 'Hello',
      });

      expect(res.text).toBe('Доброго дня! Чим можу допомогти?');
      expect(res.provider).toBe('groq');
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('normalizes recruitment or sabotage scamType to MILITARY_SABOTAGE_RECRUITMENT', async () => {
      const mockReply = JSON.stringify({
        isScam: true,
        confidence: 98,
        scamType: 'recruitment',
        reasoning: 'Співрозмовник активно вербує [Ви] на небезпечну діяльність під виглядом підробітку.',
      });

      // @ts-ignore
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: mockReply } }],
        }),
      });

      const res = await driver.verifyThreat({
        provider: 'groq',
        apiKey: 'gsk_test',
        sanitizedPrompt: 'test prompt',
      });

      expect(res.isScam).toBe(true);
      expect(res.scamType).toBe('MILITARY_SABOTAGE_RECRUITMENT');
      expect(res.reasoning).toContain('активно вербує');
    });
  });

  describe('listModels', () => {
    it('fetches models list, filters out whisper audio models, and sorts Qwen and Llama-3 to top', async () => {
      const mockModelsData = {
        data: [
          { id: 'whisper-large-v3', active: true },
          { id: 'gemma2-9b-it', active: true, context_window: 8192 },
          { id: 'qwen-qwq-32b', active: true, context_window: 32768, owned_by: 'qwen' },
          { id: 'llama-3.3-70b-versatile', active: true, context_window: 131072, owned_by: 'meta' },
        ],
      };

      // @ts-ignore
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockModelsData,
      });

      const models = await driver.listModels('gsk_key');

      expect(models.some((m) => m.id.includes('whisper'))).toBe(false);
      expect(models.length).toBe(3);

      // Qwen should be prioritized first
      expect(models[0].id).toContain('qwen');
      // Llama should be second
      expect(models[1].id).toContain('llama-3');
      // Other models third
      expect(models[2].id).toContain('gemma');
    });
  });
});
