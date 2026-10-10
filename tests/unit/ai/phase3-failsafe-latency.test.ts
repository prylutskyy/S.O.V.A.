// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecurityFriction } from '../../../src/ui/friction';
import { ShadowHost } from '../../../src/ui/shadow-host';
import { AIArbiterService } from '../../../src/ai/ai-arbiter.service';
import { ChatSessionState } from '../../../src/heuristics/chat-session-state';
import { ActiveThreatContext } from '../../../src/types';

describe('Phase 3: Fail-Safe AI & Latency UX (Uncompromising Architecture)', () => {
  const baseContext: ActiveThreatContext = {
    sessionId: 'session_phase3_test',
    sourcePlatform: 'olx.ua',
    scenario: 'ESCROW_DELIVERY_FRAUD',
    threatLevel: 'HIGH',
    detectedKeywords: ['доставка', 'отримати кошти'],
    offPlatformLure: true,
    targetSuspiciousUrl: 'https://olx.ua-pay-receive.xyz',
    timestamp: Date.now(),
    ttlMs: 300000,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    AIArbiterService.clearCache();
    ChatSessionState.reset();
    SecurityFriction.hideLatencyVeil();
  });

  afterEach(() => {
    vi.useRealTimers();
    SecurityFriction.hideLatencyVeil();
    SecurityFriction.removeContextWarningBanner();
  });

  describe('1. Latency UX: non-blocking status indicator', () => {
    it('renders an accessible compact status indicator that keeps the composer usable', () => {
      expect(SecurityFriction.isLatencyVeilActive()).toBe(false);

      const veil = SecurityFriction.showLatencyVeil();

      expect(SecurityFriction.isLatencyVeilActive()).toBe(true);
      expect(veil).not.toBeNull();
      expect(veil.id).toBe('ts-latency-veil');
      expect(veil.getAttribute('role')).toBe('status');
      expect(veil.getAttribute('aria-live')).toBe('polite');

      const root = ShadowHost.getRoot();
      const queriedVeil = root.getElementById('ts-latency-veil');
      expect(queriedVeil).toBe(veil);

      // Verify concise status and reassurance text
      const emblem = veil.querySelector('.ts-pulsing-owl');
      expect(emblem).not.toBeNull();
      expect(veil.textContent).toContain('Перевіряємо повідомлення');
      expect(veil.textContent).toContain('Ви можете продовжувати вводити текст');
      expect(veil.querySelector('style')?.textContent).toContain('pointer-events: none');
      expect(veil.querySelector('style')?.textContent).not.toContain('pointer-events: auto');
    });

    it('does not cover or align itself to the active composer input', () => {
      const composerInput = document.createElement('textarea');
      composerInput.className = 'chat-input';
      Object.defineProperty(composerInput, 'getBoundingClientRect', {
        value: () => ({ top: 400, left: 100, width: 600, height: 60, bottom: 460, right: 700 }),
      });
      document.body.appendChild(composerInput);

      const veil = SecurityFriction.showLatencyVeil();

      expect(veil.style.top).toBe('');
      expect(veil.style.left).toBe('');
      expect(veil.querySelector('style')?.textContent).toContain('top: 16px');

      composerInput.remove();
    });

    it('gracefully tears down latency veil without leaving residual DOM artifacts', () => {
      SecurityFriction.showLatencyVeil();
      expect(SecurityFriction.isLatencyVeilActive()).toBe(true);

      SecurityFriction.hideLatencyVeil();

      expect(SecurityFriction.isLatencyVeilActive()).toBe(false);
      const root = ShadowHost.getRoot();
      expect(root.getElementById('ts-latency-veil')).toBeNull();
    });

    it('idempotently handles consecutive showLatencyVeil invocations without duplicate elements', () => {
      SecurityFriction.showLatencyVeil();
      SecurityFriction.showLatencyVeil();
      SecurityFriction.showLatencyVeil();

      const root = ShadowHost.getRoot();
      const veils = root.querySelectorAll('#ts-latency-veil');
      expect(veils.length).toBe(1);
    });

    it('waits one second before showing the status indicator', () => {
      vi.useFakeTimers();

      SecurityFriction.showLatencyVeilAfter(1000);
      expect(SecurityFriction.isLatencyVeilActive()).toBe(false);

      vi.advanceTimersByTime(999);
      expect(SecurityFriction.isLatencyVeilActive()).toBe(false);

      vi.advanceTimersByTime(1);
      expect(SecurityFriction.isLatencyVeilActive()).toBe(true);
    });

    it('cancels the delayed status when arbitration finishes early', () => {
      vi.useFakeTimers();

      SecurityFriction.showLatencyVeilAfter(1000);
      SecurityFriction.hideLatencyVeil();
      vi.advanceTimersByTime(1000);

      expect(SecurityFriction.isLatencyVeilActive()).toBe(false);
      expect(ShadowHost.getRoot().getElementById('ts-latency-veil')).toBeNull();
    });
  });

  describe('2. Fail-Safe Graceful Degradation: Cloud → Local → Tier 1 Heuristics', () => {
    it('seamlessly adopts Cloud LLM verdict when online and authoritative', async () => {
      // @ts-ignore
      globalThis.chrome = {
        runtime: {
          sendMessage: vi.fn((msg: any, callback: (res: any) => void) => {
            setTimeout(() => {
              callback({
                aiResult: {
                  isScam: true,
                  confidence: 98,
                  scamType: 'ESCROW_DELIVERY_SCAM',
                  reasoning: 'Фішинговий сайт під виглядом безпечної угоди OLX.',
                  provider: 'groq',
                  modelUsed: 'llama-3.3-70b-versatile',
                  latencyMs: 340,
                },
              });
            }, 10);
          }) as any,
        },
      } as any;

      SecurityFriction.showLatencyVeil();
      expect(SecurityFriction.isLatencyVeilActive()).toBe(true);

      const verdict = await AIArbiterService.verify({
        context: baseContext,
        rawTextToScan: 'Отримайте кошти за посиланням',
      });

      SecurityFriction.hideLatencyVeil();
      expect(SecurityFriction.isLatencyVeilActive()).toBe(false);

      expect(verdict).not.toBeNull();
      expect(verdict?.isScam).toBe(true);
      expect(verdict?.confidence).toBe(98);
      expect(verdict?.provider).toBe('groq');
      expect(ChatSessionState.sessionLlmVerdict).toBe('SCAM');
    });

    it('gracefully degrades to local / null when cloud connection times out or fails', async () => {
      // Mock failure / null from background offscreen bridge
      // @ts-ignore
      globalThis.chrome = {
        runtime: {
          sendMessage: vi.fn((_msg: any, callback: (res: any) => void) => {
            setTimeout(() => {
              // Simulated timeout / offline: background returns null
              callback({ aiResult: null });
            }, 10);
          }) as any,
        },
      } as any;

      SecurityFriction.showLatencyVeil();

      const verdict = await AIArbiterService.verify({
        context: baseContext,
        rawTextToScan: 'Отримайте кошти',
      });

      SecurityFriction.hideLatencyVeil();

      // System does not crash: returns null for Tier 1 heuristic fallback
      expect(verdict).toBeNull();
      expect(SecurityFriction.isLatencyVeilActive()).toBe(false);
      // Session state is preserved without erroneous verdict override
      expect(ChatSessionState.sessionLlmVerdict).toBeNull();
    });

    it('clears false positive and grants session immunity when AI proves dialogue is safe', async () => {
      // Interlocutor discussing security safely
      // @ts-ignore
      globalThis.chrome = {
        runtime: {
          sendMessage: vi.fn((_msg: any, callback: (res: any) => void) => {
            setTimeout(() => {
              callback({
                aiResult: {
                  isScam: false,
                  confidence: 94,
                  reasoning: 'Користувач обговорює безпеку і попереджає про шахраїв.',
                  provider: 'chrome-builtin-ai',
                  modelUsed: 'gemini-nano',
                  latencyMs: 180,
                },
              });
            }, 10);
          }) as any,
        },
      } as any;

      const verdict = await AIArbiterService.verify({
        context: { ...baseContext, threatLevel: 'MEDIUM' },
        rawTextToScan: 'Обережно, не переходьте за лінками доставки, це обман!',
        confidence: 60,
      });

      expect(verdict).not.toBeNull();
      expect(verdict?.isScam).toBe(false);
      expect(ChatSessionState.sessionLlmVerdict).toBe('SAFE');
      expect(ChatSessionState.sessionLlmImmunityPeakScore).toBe(60);
    });
  });

  describe('3. Dynamic Adaptive UI Typology Synthesis', () => {
    it('correctly adapts context warning banner to MILITARY_SABOTAGE_RECRUITMENT typology', () => {
      const sabotageContext: ActiveThreatContext = {
        ...baseContext,
        scenario: 'MILITARY_SABOTAGE_RECRUITMENT',
        detectedKeywords: ['підпал релейної шафи', 'винагорода 500$'],
      };

      SecurityFriction.showContextWarningBanner(
        sabotageContext,
        'Контррозвідка СБУ',
        'Підпали релейну шафу за гроші',
        'MILITARY_SABOTAGE_RECRUITMENT'
      );

      const root = ShadowHost.getRoot();
      const banner = root.getElementById('threat-shield-context-banner');
      expect(banner).not.toBeNull();

      // Check civic defense badge and title
      expect(banner?.textContent).toContain('Державна безпека');
      expect(banner?.textContent).toContain('Контррозвідка СБУ');
      expect(banner?.textContent).toContain('Ознаки ворожого вербування або диверсії');
      expect(banner?.textContent).toContain('Закон на вашому боці (ч. 3 ст. 111 ККУ)');
    });

    it('correctly adapts context warning banner to ESCROW_DELIVERY_SCAM typology', () => {
      SecurityFriction.showContextWarningBanner(
        baseContext,
        'Фішинг доставки',
        'Перейдіть на сайт olx-pay.safe-deal.com',
        'ESCROW_DELIVERY_SCAM'
      );

      const root = ShadowHost.getRoot();
      const banner = root.getElementById('threat-shield-context-banner');
      expect(banner).not.toBeNull();

      expect(banner?.textContent).toContain('Кібербезпека');
      expect(banner?.textContent).toContain('Фішинг доставки');
      expect(banner?.textContent).toContain('Застереження: фішинг доставки');
      expect(banner?.textContent).toContain('Золоті правила безпеки');
    });

    it('correctly adapts context warning banner to CRYPTO_WALLET_COMPROMISE typology', () => {
      const cryptoContext: ActiveThreatContext = {
        ...baseContext,
        scenario: 'CRYPTO_WALLET_COMPROMISE',
      };

      SecurityFriction.showContextWarningBanner(
        cryptoContext,
        'Криптозахист',
        'Введіть seed фразу з 12 слів',
        'CRYPTO_WALLET_COMPROMISE'
      );

      const root = ShadowHost.getRoot();
      const banner = root.getElementById('threat-shield-context-banner');
      expect(banner).not.toBeNull();

      expect(banner?.textContent).toContain('Криптозахист');
      expect(banner?.textContent).toContain('Спроба викрадення криптогаманця');
    });
  });
});
