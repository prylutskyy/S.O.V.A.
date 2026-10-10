import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroqDriver } from '../../../src/ai/cloud/drivers/groq-driver';
import { OpenAIDriver } from '../../../src/ai/cloud/drivers/openai-driver';
import { OpenRouterDriver } from '../../../src/ai/cloud/drivers/openrouter-driver';
import { GeminiDriver } from '../../../src/ai/cloud/drivers/gemini-driver';
import { ChromeBuiltinAIProvider } from '../../../src/heuristics/chrome-ai-provider';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const reply = '{"isScam":false,"confidence":90,"scamType":"UNKNOWN","reasoning":"Safe discussion"}';
describe('Provider request diagnostics contain actual text and no credentials', () => {
  it.each([
    { provider: 'groq' as const, driver: new GroqDriver() },
    { provider: 'openai' as const, driver: new OpenAIDriver() },
    { provider: 'openrouter' as const, driver: new OpenRouterDriver() },
    { provider: 'gemini' as const, driver: new GeminiDriver() },
  ])('captures the exact successful $provider request messages', async ({ provider, driver }) => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      choices: [{ message: { content: reply } }], candidates: [{ content: { parts: [{ text: reply }] } }],
    }) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await driver.verifyThreat({ provider, sanitizedPrompt: 'Sanitized [PRIVATE_DATA]', apiKey: 'test-secret-key' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const actual = body.messages || body.contents.map((item: any) => ({ role: 'user', content: item.parts.map((part: any) => part.text).join('\n') }));
    expect(result.requestMessages).toEqual(actual);
    expect(JSON.stringify(result.requestMessages)).not.toContain('test-secret-key');
  });
  it.each([false, true])('captures the native prompt with accurate system-instruction fallback (bare=%s)', async bare => {
    const prompt = vi.fn().mockResolvedValue(reply);
    const create = vi.fn(async (options: any) => {
      if (bare && (options?.systemPrompt || options?.initialPrompts)) throw new Error('Unsupported options');
      return { prompt, destroy: vi.fn() };
    });
    vi.stubGlobal('LanguageModel', { create, capabilities: async () => ({ available: 'readily' }) });
    const result = await new ChromeBuiltinAIProvider().verifyIntent('Test message', 'Test rule');
    expect(result?.requestMessages?.at(-1)?.content).toBe(prompt.mock.calls[0][0]);
    expect(result?.requestMessages?.some(item => item.role === 'system')).toBe(!bare);
    if (!bare) expect(result?.requestMessages?.[0].content).toBe(create.mock.calls[0][0].systemPrompt);
    expect(result?.provider).toBe('Chrome Built-in AI');
  });
});
