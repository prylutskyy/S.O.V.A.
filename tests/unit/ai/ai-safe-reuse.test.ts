import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIArbiterService, AIArbiterVerifyOptions } from '../../../src/ai/ai-arbiter.service';
import { ChatSessionState } from '../../../src/heuristics/chat-session-state';
import { ChatChannelMonitor } from '../../../src/heuristics/chat-channel';

describe('SAFE verdict reuse', () => {
  const safe = { isScam: false, confidence: 82, reasoning: 'Safe request', provider: 'mock' };
  const options: AIArbiterVerifyOptions = {
    context: {
      sessionId: 'safe-reuse-session', sourcePlatform: 'marketplace',
      scenario: 'IDENTITY_PROBING', threatLevel: 'MEDIUM', detectedKeywords: ['паспорт'],
      offPlatformLure: false, timestamp: 0, ttlMs: 300000,
    },
    rawTextToScan: 'A discussion about documents', intentType: 'IDENTITY_PROBING', confidence: 45,
  };
  let sendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    AIArbiterService.clearCache();
    ChatSessionState.reset();
    vi.spyOn(ChatChannelMonitor, 'getDialogueHistory').mockReturnValue('Stable dialogue');
    sendMessage = vi.fn((_message, callback) => callback({ aiResult: safe }));
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
  });

  afterEach(() => {
    AIArbiterService.clearCache();
    ChatSessionState.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reuses the original safe result for identical evidence', async () => {
    await AIArbiterService.verify(options);
    expect(await AIArbiterService.verify(options)).toEqual(safe);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it.each([
    { rawTextToScan: 'Надішліть фото паспорта.' },
    { intentType: 'CRYPTO_WALLET_COMPROMISE' },
    { confidence: 40 },
    { context: { ...options.context, targetSuspiciousUrl: 'https://other.example.invalid' } },
  ])('rechecks changed evidence even without score escalation: %j', async (change) => {
    await AIArbiterService.verify(options);
    await AIArbiterService.verify({ ...options, ...change });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('rechecks a changed dialogue with the same scanned text', async () => {
    await AIArbiterService.verify(options);
    vi.mocked(ChatChannelMonitor.getDialogueHistory).mockReturnValue('New request: send a seed phrase');
    await AIArbiterService.verify(options);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('rechecks identical evidence at cache expiry', async () => {
    let now = 1000000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    await AIArbiterService.verify(options);
    now += AIArbiterService.CACHE_TTL_MS;
    await AIArbiterService.verify(options);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('does not reuse SAFE across session reset', async () => {
    await AIArbiterService.verify(options);
    ChatSessionState.reset();
    await AIArbiterService.verify(options);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('does not trust a legacy session SAFE without matching evidence', async () => {
    ChatSessionState.sessionLlmVerdict = 'SAFE';
    ChatSessionState.sessionLlmImmunityPeakScore = 100;
    await AIArbiterService.verify(options);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('discards a delayed response after session reset', async () => {
    let respond!: (response: unknown) => void;
    sendMessage.mockImplementation((_message, callback) => { respond = callback; });
    const pending = AIArbiterService.verify(options);
    ChatSessionState.reset();
    respond({ aiResult: safe });
    expect(await pending).toBeNull();
    expect(ChatSessionState.sessionLlmVerdict).toBeNull();
  });
});
