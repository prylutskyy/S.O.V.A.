import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIArbiterService } from '../../../src/ai/ai-arbiter.service';
import { ActiveThreatContext } from '../../../src/types';
import { ChatSessionState } from '../../../src/heuristics/chat-session-state';

describe('AIArbiterService (Single-Flight & Cache)', () => {
  const baseContext: ActiveThreatContext = {
    sessionId: 'test-session',
    sourcePlatform: 'olx.ua',
    scenario: 'ESCROW_DELIVERY_FRAUD',
    threatLevel: 'HIGH',
    detectedKeywords: ['доставка', 'оплата'],
    offPlatformLure: true,
    targetSuspiciousUrl: 'https://olx-pay.safe-deal.com',
    timestamp: Date.now(),
    ttlMs: 300000,
  };

  beforeEach(() => {
    AIArbiterService.clearCache();
    ChatSessionState.reset();
    vi.restoreAllMocks();
  });

  it('should return null when chrome.runtime is unavailable', async () => {
    // @ts-ignore
    globalThis.chrome = undefined;
    const result = await AIArbiterService.verify({ context: baseContext });
    expect(result).toBeNull();
  });

  it.each(['', 'Надішліть серію та номер паспорта для отримання переказу.'])(
    'does not fabricate URL telemetry for a text-only request (%s)', async (targetSuspiciousUrl) => {
      const sendMessage = vi.fn((_message: any, callback: (response: any) => void) => {
        callback({ aiResult: { isScam: true, confidence: 98, scamType: 'IDENTITY_PROBING', reasoning: 'Запит паспортних даних.' } });
      });
      vi.stubGlobal('chrome', { runtime: { sendMessage } });
      const result = await AIArbiterService.verify({
        context: { ...baseContext, offPlatformLure: false, targetSuspiciousUrl },
        rawTextToScan: 'Надішліть серію та номер паспорта для отримання переказу.',
        intentType: 'IDENTITY_PROBING', confidence: 45,
      });
      const payload = sendMessage.mock.calls[0][0].payload;
      expect(payload.text).toContain('номер паспорта');
      expect(payload.heuristicContext.suspiciousUrls).toEqual([]);
      expect(payload.heuristicContext.targetHost).toBeUndefined();
      expect(payload.heuristicContext.raisedFlags).not.toContain('Підозріле посилання у тексті');
      expect(payload.sanitizedPrompt).not.toContain('Route: olx.ua -> external');
      expect(result?.scamType).toBe('IDENTITY_PROBING');
    }
  );

  it('preserves actual URL paths and independently reports URL and off-platform flags', async () => {
    const sendMessage = vi.fn((_message: any, callback: (response: any) => void) => {
      callback({ aiResult: { isScam: false, confidence: 90, reasoning: 'Тест.' } });
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    await AIArbiterService.verify({ context: { ...baseContext, targetSuspiciousUrl: 'https://example.invalid/Verify?token=ABC' } });
    const telemetry = sendMessage.mock.calls[0][0].payload.heuristicContext;
    expect(telemetry.suspiciousUrls).toEqual(['https://example.invalid/Verify?token=ABC']);
    expect(telemetry.targetHost).toBe('example.invalid');
    expect(telemetry.raisedFlags).toContain('Підозріле посилання у тексті');
    expect(telemetry.raisedFlags).toContain('Спроба переведення в сторонній месенджер');
  });

  it('should perform inference and cache result for identical requests', async () => {
    let messageCount = 0;
    // Mock chrome.runtime
    // @ts-ignore
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn((msg: any, callback: (res: any) => void) => {
          messageCount++;
          setTimeout(() => {
            callback({
              aiResult: {
                isScam: true,
                confidence: 96,
                reasoning: 'Fake escrow delivery domain targeting OLX sellers.',
              },
            });
          }, 10);
        }) as any,
      },
    } as any;

    const firstResult = await AIArbiterService.verify({
      context: baseContext,
      rawTextToScan: 'Будь ласка, перейдіть за цим лінком',
    });

    expect(firstResult).not.toBeNull();
    expect(firstResult?.isScam).toBe(true);
    expect(firstResult?.confidence).toBe(96);
    expect(messageCount).toBe(1);

    // Second call with same context: must be served from cache instantly!
    const secondResult = await AIArbiterService.verify({
      context: baseContext,
      rawTextToScan: 'Будь ласка, перейдіть за цим лінком',
    });

    expect(secondResult).not.toBeNull();
    expect(secondResult?.isScam).toBe(true);
    // messageCount must STILL be 1 because it was served from cache
    expect(messageCount).toBe(1);
  });

  it('should coalesce concurrent identical requests into a single in-flight call', async () => {
    let messageCount = 0;
    // @ts-ignore
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn((msg: any, callback: (res: any) => void) => {
          messageCount++;
          setTimeout(() => {
            callback({
              aiResult: {
                isScam: true,
                confidence: 90,
                reasoning: 'Suspicious payment link',
              },
            });
          }, 30);
        }) as any,
      },
    } as any;

    // Trigger two calls concurrently
    const p1 = AIArbiterService.verify({ context: baseContext, rawTextToScan: 'text' });
    const p2 = AIArbiterService.verify({ context: baseContext, rawTextToScan: 'text' });

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toEqual(r2);
    expect(messageCount).toBe(1); // Deduped!
  });

  it('should cancel superseded request when context changes', async () => {
    // @ts-ignore
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn((msg: any, callback: (res: any) => void) => {
          setTimeout(() => {
            callback({
              aiResult: {
                isScam: true,
                confidence: 80,
                reasoning: 'Result for ' + msg.payload.text,
              },
            });
          }, 50);
        }) as any,
      },
    } as any;

    // First request
    const p1 = AIArbiterService.verify({ context: baseContext, rawTextToScan: 'initial text' });

    // Rapid second request with updated text (user typed more)
    const p2 = AIArbiterService.verify({ context: baseContext, rawTextToScan: 'initial text with more typing' });

    const [r1, r2] = await Promise.all([p1, p2]);

    // r1 was superseded and aborted -> null
    expect(r1).toBeNull();
    // r2 is the active one -> resolved
    expect(r2).not.toBeNull();
    expect(r2?.reasoning).toContain('initial text with more typing');
  });
});
