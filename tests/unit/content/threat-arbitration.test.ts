// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatChannelMonitor } from '../../../src/heuristics/chat-channel';
import { ChatSessionState } from '../../../src/heuristics/chat-session-state';
import { GlobalInputInterceptor } from '../../../src/heuristics/input-interceptor';
import { AIArbiterService } from '../../../src/ai/ai-arbiter.service';
import { SecurityFriction } from '../../../src/ui/friction';
import { ShadowHost } from '../../../src/ui/shadow-host';
import { DebuggerOverlay } from '../../../src/ui/debugger-overlay';
import { UserWhitelistManager } from '../../../src/core/user-whitelist';
import { PersonalVaultManager } from '../../../src/core/personal-vault';
import { SpaNavigationDetector } from '../../../src/core/spa-navigation';
import { ProactiveFormScanner } from '../../../src/heuristics/hidden-field-inspector';
import { ProactiveFieldProtector } from '../../../src/heuristics/proactive-field-protector';
import { NetworkExfiltrationInterceptor } from '../../../src/interceptors/network-exfiltration.interceptor';
import { FormSubmitInterceptor } from '../../../src/interceptors/form-submit.interceptor';
import { ChatSubmitInterceptor } from '../../../src/interceptors/chat-submit.interceptor';
import { ClipboardInterceptor } from '../../../src/interceptors/clipboard.interceptor';

describe('Content runtime: incoming message → arbiter → real banner and input', () => {
  let response: any;
  let pendingCallback: ((response: any) => void) | undefined;
  let sendMessage: ReturnType<typeof vi.fn>;
  let changeRoute: () => void;
  const listeners: Array<[EventTarget, string, any, any]> = [];
  const passport = 'Надішліть серію та номер паспорта для отримання переказу.';

  beforeEach(async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div class="messages"></div><textarea aria-label="Повідомлення"></textarea>';
    ChatChannelMonitor.destroy();
    ChatSessionState.reset();
    AIArbiterService.clearCache();
    GlobalInputInterceptor.setHardLock(null);
    ShadowHost.clear();
    DebuggerOverlay.clear();
    response = null;
    pendingCallback = undefined;
    sendMessage = vi.fn((message, callback) => {
      if (message.type !== 'AI_VERIFY') return Promise.resolve({});
      if (response === 'throw') throw new Error('Transport unavailable');
      if (response === 'pending') { pendingCallback = callback; return; }
      callback({ aiResult: response });
    });
    vi.stubGlobal('chrome', {
      runtime: { sendMessage, getURL: (path: string) => path, onMessage: { addListener: vi.fn() } },
      storage: { local: { get: async () => ({}), set: vi.fn() }, onChanged: { addListener: vi.fn() } },
    });
    vi.stubGlobal('defineContentScript', (definition: any) => definition);
    // Keep chat intake, arbitration, mitigation and UI real; suppress unrelated form/network scanners.
    vi.spyOn(UserWhitelistManager, 'init').mockResolvedValue(undefined);
    vi.spyOn(UserWhitelistManager, 'isDomainAllowedSync').mockReturnValue(false);
    vi.spyOn(PersonalVaultManager, 'init').mockResolvedValue(undefined);
    vi.spyOn(PersonalVaultManager, 'getItemsSync').mockReturnValue([]);
    for (const manager of [ProactiveFormScanner, ProactiveFieldProtector, NetworkExfiltrationInterceptor,
      FormSubmitInterceptor, ChatSubmitInterceptor, ClipboardInterceptor]) {
      vi.spyOn(manager, 'init').mockImplementation(() => {});
    }
    vi.spyOn(SpaNavigationDetector, 'init').mockImplementation((callback) => {
      changeRoute = () => callback!({ trigger: 'pushState' } as any);
    });
    for (const target of [window, document]) {
      const original = target.addEventListener.bind(target);
      vi.spyOn(target, 'addEventListener').mockImplementation((type, listener, options) => {
        listeners.push([target, type, listener, options]);
        original(type, listener, options);
      });
    }
    const script = (await import('../../../entrypoints/content')).default as unknown as { main(): Promise<void> };
    await script.main();
    await vi.advanceTimersByTimeAsync(0);
  });

  afterEach(() => {
    ChatChannelMonitor.destroy();
    AIArbiterService.cancelPending();
    SecurityFriction.removeContextWarningBanner();
    SecurityFriction.hideLatencyVeil();
    GlobalInputInterceptor.setHardLock(null);
    for (const [target, type, listener, options] of listeners.splice(0)) {
      target.removeEventListener(type, listener, options);
    }
    ShadowHost.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function receive(text = passport, direction = 'has-text-left') {
    const message = document.createElement('div');
    message.className = direction;
    message.innerHTML = '<span class="tag"></span>';
    message.firstElementChild!.textContent = text;
    document.querySelector('.messages')!.append(message);
    await vi.advanceTimersByTimeAsync(0);
  }
  const banner = () => ShadowHost.getRoot().getElementById('threat-shield-context-banner');
  function expectEditable() {
    const input = document.querySelector('textarea')!;
    const key = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    input.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    expect(input.disabled).toBe(false);
    expect(document.getElementById('ts-chat-freeze-style')).toBeNull();
  }

  it('shows the actual identity warning at local score 45 when AI is unavailable', async () => {
    await receive();
    expect(banner()?.textContent).toContain('Персональні дані');
    DebuggerOverlay.show();
    expect(DebuggerOverlay['shadowRoot']?.textContent).toContain('АКТИВНА ЗАГРОЗА: ПОПЕРЕДЖЕННЯ');
    expect(DebuggerOverlay['shadowRoot']?.textContent).toContain('локальні евристики');
    expect(DebuggerOverlay['state'].score).toBe(45);
    expect(SecurityFriction.isLatencyVeilActive()).toBe(false);
    expectEditable();
    expect(sendMessage.mock.calls.some(([message]) => message.type === 'LURE_DETECTED')).toBe(true);
  });

  it('shows the confirmed AI warning without freezing ordinary input', async () => {
    response = { isScam: true, confidence: 98, scamType: 'IDENTITY_PROBING', reasoning: 'Запит паспортних даних.' };
    await receive();
    expect(banner()?.textContent).toContain('Персональні дані');
    expectEditable();
  });

  it('removes an existing critical warning and restores input after convincing SAFE', async () => {
    await receive('Please provide your seed phrase and send your password to synchronize wallet');
    expect(banner()).not.toBeNull();
    const key = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    document.querySelector('textarea')!.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    response = { isScam: false, confidence: 95, reasoning: 'Це безпечне обговорення.' };
    await receive('Надішліть фото паспорта для отримання грошей.');
    expect(banner()).toBeNull();
    expect(DebuggerOverlay['state'].activeDecision).toBeNull();
    expectEditable();
    expect(sendMessage.mock.calls.some(([message]) => message.type === 'CLEAR_CONTEXT')).toBe(true);
  });

  it('uses local evidence when SAFE is inconclusive', async () => {
    response = { isScam: false, confidence: 20, reasoning: 'Недостатньо контексту.' };
    await receive();
    expect(banner()?.textContent).toContain('Персональні дані');
    expectEditable();
  });

  it('warns after transport failure', async () => {
    response = 'throw';
    await receive();
    expect(banner()).not.toBeNull();
    expectEditable();
  });

  it('warns if the arbiter itself rejects', async () => {
    vi.spyOn(AIArbiterService, 'verify').mockRejectedValue(new Error('Arbiter failure'));
    await receive();
    expect(banner()).not.toBeNull();
    expect(SecurityFriction.isLatencyVeilActive()).toBe(false);
    expectEditable();
  });

  it('preserves actual input blocking for a high-score seed phrase attack without AI', async () => {
    await receive('Please provide your seed phrase and send your password to synchronize wallet');
    expect(banner()).not.toBeNull();
    const key = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    document.querySelector('textarea')!.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    expect(DebuggerOverlay['state'].activeDecision?.action).toBe('LOCK_INPUT');
  });

  it('warns on timeout and ignores a late SAFE reply, including its cache/session effects', async () => {
    response = 'pending';
    await receive();
    expect(banner()).toBeNull();
    await vi.advanceTimersByTimeAsync(AIArbiterService.REQUEST_TIMEOUT_MS);
    expect(banner()?.textContent).toContain('Персональні дані');
    expect(SecurityFriction.isLatencyVeilActive()).toBe(false);
    pendingCallback!({ aiResult: { isScam: false, confidence: 99, reasoning: 'Запізнілий результат.' } });
    await vi.advanceTimersByTimeAsync(0);
    expect(banner()).not.toBeNull();
    expect(ChatSessionState.sessionLlmVerdict).not.toBe('SAFE');
    expectEditable();
  });

  it('does not carry a pending timeout into another conversation', async () => {
    response = 'pending';
    await receive();
    changeRoute();
    await vi.advanceTimersByTimeAsync(AIArbiterService.REQUEST_TIMEOUT_MS);
    expect(banner()).toBeNull();
    expectEditable();
  });

  it('does not warn or call AI for a benign message or the user’s outgoing passport request', async () => {
    await receive('Не надсилайте номер паспорта в чаті.');
    await receive(passport, 'has-text-right');
    expect(banner()).toBeNull();
    expect(sendMessage.mock.calls.some(([message]) => message.type === 'AI_VERIFY')).toBe(false);
    expectEditable();
  });
});
