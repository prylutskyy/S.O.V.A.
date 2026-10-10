// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DebuggerOverlay } from '../../../src/ui/debugger-overlay';
import { AICheckHistory } from '../../../src/ui/ai-check-history';
import { AIArbiterService } from '../../../src/ai/ai-arbiter.service';
import { ChatSessionState } from '../../../src/heuristics/chat-session-state';
import { ChatChannelMonitor } from '../../../src/heuristics/chat-channel';

const safe = { isScam: false, confidence: 82, reasoning: 'Безпечне обговорення.', provider: 'mock',
  modelUsed: 'mock-model', latencyMs: 515, rawResponse: '{"isScam":false,"confidence":82}' };
const options = { context: { sessionId: 'chat-a', sourcePlatform: 'test.invalid', scenario: 'IDENTITY_PROBING',
  threatLevel: 'MEDIUM' as const, detectedKeywords: ['паспорт'], offPlatformLure: false, timestamp: 0, ttlMs: 300000 },
  rawTextToScan: 'Надішліть номер паспорта.', intentType: 'IDENTITY_PROBING', confidence: 45 };
const root = () => DebuggerOverlay['shadowRoot']!;
const click = (selector: string) => root().querySelector<HTMLButtonElement>(selector)!.click();
const openAI = () => { DebuggerOverlay.show(); click('[data-tab="ai"]'); };
const add = (text: string, result = safe) => {
  const id = DebuggerOverlay.beginAICheck({ sessionId: 'chat-a', text, intent: 'IDENTITY_PROBING' });
  DebuggerOverlay.finishAICheck(id, 'completed', result);
  return id;
};

beforeEach(() => {
  AIArbiterService.clearCache(); ChatSessionState.reset();
  DebuggerOverlay.hide(); DebuggerOverlay.clear();
  document.getElementById('threatshield-neuro-monitor')?.remove();
  DebuggerOverlay['container'] = null; DebuggerOverlay['shadowRoot'] = null;
  DebuggerOverlay['aiScope'] = 'current';
  DebuggerOverlay.setSession('chat-a', 'LOW');
  vi.spyOn(ChatChannelMonitor, 'getDialogueHistory').mockReturnValue('[Співрозмовник]: Надішліть номер паспорта.');
});
afterEach(() => {
  AIArbiterService.clearCache(); DebuggerOverlay.hide();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('Structured check lifecycle through the actual arbiter', () => {
  it('keeps start time and one check identity from pending to completion', async () => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    let respond!: (result: unknown) => void;
    vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn((_m, callback) => { respond = callback; }) } });
    const promise = AIArbiterService.verify(options);
    const pending = DebuggerOverlay.getAIChecks()[0];
    expect(pending).toMatchObject({ status: 'pending', startedAt: 10000, sessionId: 'chat-a' });
    vi.setSystemTime(10700); respond({ aiResult: safe }); await promise;
    expect(DebuggerOverlay.getAIChecks()).toHaveLength(1);
    expect(DebuggerOverlay.getAIChecks()[0]).toMatchObject({ id: pending.id, startedAt: 10000,
      finishedAt: 10700, durationMs: 700, status: 'completed', result: safe });
  });
  it('cancels the exact previous check and rejects its late response', async () => {
    const callbacks: ((result: unknown) => void)[] = [];
    vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn((_m, callback) => callbacks.push(callback)) } });
    const first = AIArbiterService.verify(options);
    const second = AIArbiterService.verify({ ...options, rawTextToScan: 'Інша репліка' });
    expect(await first).toBeNull();
    callbacks[0]({ aiResult: safe }); callbacks[1]({ aiResult: safe }); await second;
    expect(DebuggerOverlay.getAIChecks().map(item => item.status)).toEqual(['cancelled', 'completed']);
    expect(DebuggerOverlay.getAIChecks()[0].result).toBeUndefined();
  });
  it('coalesces identical in-flight calls into one diagnostic check', async () => {
    let respond!: (result: unknown) => void;
    const send = vi.fn((_m, callback) => { respond = callback; });
    vi.stubGlobal('chrome', { runtime: { sendMessage: send } });
    const first = AIArbiterService.verify(options), second = AIArbiterService.verify(options);
    respond({ aiResult: safe }); await Promise.all([first, second]);
    expect(send).toHaveBeenCalledTimes(1); expect(DebuggerOverlay.getAIChecks()).toHaveLength(1);
  });
  it('marks timeout as terminal even if a result arrives later', async () => {
    vi.useFakeTimers(); let respond!: (result: unknown) => void;
    vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn((_m, callback) => { respond = callback; }) } });
    const promise = AIArbiterService.verify(options);
    await vi.advanceTimersByTimeAsync(AIArbiterService.REQUEST_TIMEOUT_MS);
    expect(await promise).toBeNull(); respond({ aiResult: safe });
    expect(DebuggerOverlay.getAIChecks()[0].status).toBe('timeout');
    expect(DebuggerOverlay.getAIChecks()[0].result).toBeUndefined();
  });
  it.each(['throw', 'empty'])('records %s transport failure instead of leaving a pending check', async mode => {
    vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn((_m, callback) => {
      if (mode === 'throw') throw new Error('test transport'); else callback({ aiResult: null });
    }) } });
    expect(await AIArbiterService.verify(options)).toBeNull();
    expect(DebuggerOverlay.getAIChecks()[0].status).toBe('error');
  });
  it('marks a response for an obsolete session as cancelled', async () => {
    let respond!: (result: unknown) => void;
    vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn((_m, callback) => { respond = callback; }) } });
    const promise = AIArbiterService.verify(options); ChatSessionState.reset();
    respond({ aiResult: safe }); expect(await promise).toBeNull();
    expect(DebuggerOverlay.getAIChecks()[0].status).toBe('cancelled');
  });
  it('records cache reuse with its original check without dispatching another inference', async () => {
    const send = vi.fn((_m, callback) => callback({ aiResult: safe }));
    vi.stubGlobal('chrome', { runtime: { sendMessage: send } });
    await AIArbiterService.verify(options); await AIArbiterService.verify(options);
    const checks = DebuggerOverlay.getAIChecks();
    expect(send).toHaveBeenCalledTimes(1);
    expect(checks[1]).toMatchObject({ source: 'cache', originalCheckId: checks[0].id, result: safe });
    openAI();
    expect(root().querySelector('.sc-check-detail')!.textContent).toContain('Нового звернення до моделі немає');
    expect(root().querySelector('.sc-check-detail')!.textContent).not.toContain('515 мс у провайдера');
  });
  it('labels session quarantine as policy reuse rather than a new model result', async () => {
    const send = vi.fn(); vi.stubGlobal('chrome', { runtime: { sendMessage: send } });
    ChatSessionState.sessionLlmVerdict = 'SCAM'; await AIArbiterService.verify(options);
    expect(send).not.toHaveBeenCalled();
    expect(DebuggerOverlay.getAIChecks()[0].source).toBe('session-quarantine');
    openAI(); expect(root().textContent).toContain('Оцінка політики карантину');
  });
});

describe('Inspector navigation and live review', () => {
  it('shows one result with initially collapsed details and a compact history', () => {
    add('Перша репліка'); add('Друга репліка'); openAI();
    expect(root().querySelectorAll('.sc-check-detail')).toHaveLength(1);
    expect(root().querySelectorAll('.sc-history-row')).toHaveLength(2);
    expect(Array.from(root().querySelectorAll('details')).every(item => !item.open)).toBe(true);
    expect(root().textContent).toContain('Впевненість моделі: 82%');
  });
  it('freezes displayed data while analysis continues, then resumes the latest result', () => {
    const id = DebuggerOverlay.beginAICheck({ sessionId: 'chat-a', text: 'Перевірити' }); openAI();
    click('#btn-review-pause'); const detail = root().querySelector('.sc-check-detail')!.textContent;
    DebuggerOverlay.finishAICheck(id, 'completed', safe);
    expect(DebuggerOverlay.getAIChecks()[0].status).toBe('completed');
    expect(root().querySelector('.sc-check-detail')!.textContent).toBe(detail);
    expect(root().querySelector('#sc-new-updates')!.textContent).toContain('нові дані');
    click('#btn-review-pause'); expect(root().querySelector('.sc-check-detail')!.textContent).toContain('Безпечне обговорення');
  });
  it('pins an older check until the user explicitly follows the latest', () => {
    const old = add('Стара репліка'); add('Поточна репліка'); openAI();
    click(`[data-ai-check="${old}"]`); const heading = root().querySelector('.sc-check-heading')!.textContent;
    add('Нова репліка'); expect(root().querySelector('.sc-check-heading')!.textContent).toBe(heading);
    expect(root().querySelector('#btn-ai-latest')!.textContent).toContain('нових: 2');
    click('#btn-ai-latest'); expect(root().textContent).toContain('Остання перевірка');
  });
  it('preserves expanded sections and reading position across incoming updates', () => {
    const id = add('Перша'); openAI(); click(`[data-ai-check="${id}"]`);
    const details = root().querySelector<HTMLDetailsElement>('details')!;
    details.open = true; details.dispatchEvent(new Event('toggle'));
    root().querySelector<HTMLElement>('.sc-viewport')!.scrollTop = 120;
    add('Друга');
    expect(root().querySelector<HTMLDetailsElement>('details')!.open).toBe(true);
    expect(root().querySelector<HTMLElement>('.sc-viewport')!.scrollTop).toBe(120);
  });
  it('does not replace selected diagnostic text while new data arrives', () => {
    add('Перша'); openAI();
    const reason = root().querySelector('.sc-check-reason')!;
    const range = document.createRange(); range.selectNodeContents(reason);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    DebuggerOverlay.log('Подія', 'Нова', undefined, false);
    expect(root().querySelector('.sc-check-reason')).toBe(reason);
    expect(root().querySelector('#sc-new-updates')!.textContent).toContain('нові дані');
    window.getSelection()!.removeAllRanges();
    click('#sc-new-updates');
    expect(root().querySelector('.sc-check-reason')).not.toBe(reason);
  });
  it('preserves the search caret rather than moving it to the end on updates', () => {
    DebuggerOverlay.show(); click('[data-tab="events"]');
    const input = root().querySelector<HTMLInputElement>('#sc-input-search')!;
    input.value = 'abcdef'; input.focus(); input.setSelectionRange(2, 2);
    input.dispatchEvent(new Event('input'));
    expect(root().querySelector<HTMLInputElement>('#sc-input-search')!.selectionStart).toBe(2);
    DebuggerOverlay.log('Крок', 'Нова подія', undefined, false);
    expect(root().querySelector<HTMLInputElement>('#sc-input-search')!.selectionStart).toBe(2);
  });
  it('separates current protection from the selected model verdict and freezes it during pause', () => {
    add('Репліка'); DebuggerOverlay.setThreatDecision('WARN', 'IDENTITY_PROBING', 45, 'local'); openAI();
    expect(root().textContent).toContain('Модель не виявила загрози');
    expect(root().textContent).toContain('Попередження · введення доступне');
    click('#btn-review-pause'); DebuggerOverlay.setThreatDecision('LOCK_INPUT', 'CRYPTO_WALLET_COMPROMISE', 85, 'local');
    expect(root().querySelector('.sc-check-protection')!.textContent).not.toContain('Введення заблоковане');
    click('#btn-review-pause'); expect(root().querySelector('.sc-check-protection')!.textContent).toContain('Введення заблоковане');
  });
  it('filters to the current conversation and exposes older sessions only explicitly', () => {
    add('Розмова A'); DebuggerOverlay.setSession('chat-b'); openAI();
    expect(root().textContent).toContain('Перевірок ШІ ще немає');
    const scope = root().querySelector<HTMLSelectElement>('#sc-ai-scope')!;
    scope.value = 'all'; scope.dispatchEvent(new Event('change'));
    expect(root().textContent).toContain('Ця перевірка належить іншій розмові');
  });
  it('keeps chronological event occurrences and links a check to its inspector', () => {
    DebuggerOverlay.log('Крок', 'Перша', undefined, false); DebuggerOverlay.log('Крок', 'Друга', undefined, false);
    const id = add('Репліка'); DebuggerOverlay.show(); click('[data-tab="events"]');
    expect(root().querySelectorAll('.sc-event-title').length).toBe(4);
    expect(root().textContent).toContain('Перша'); expect(root().textContent).toContain('Друга');
    click(`[data-ai-open="${id}"]`); expect(root().textContent).toContain('Вибрана перевірка');
  });
  it('pauses event display without dropping incoming events', () => {
    DebuggerOverlay.show(); click('[data-tab="events"]'); click('#btn-review-pause');
    DebuggerOverlay.log('Подія', 'Нова подія', undefined, false);
    expect(root().querySelectorAll('.sc-event-card')).toHaveLength(0);
    click('#btn-review-pause'); expect(root().textContent).toContain('Нова подія');
  });
  it('keeps event cards compact and reveals diagnostic payload only on request', () => {
    DebuggerOverlay.log('Перевірка контексту', { channel: 'inbound', ageMinutes: 2 }, undefined, false);
    DebuggerOverlay.show(); click('[data-tab="events"]');
    const details = root().querySelector<HTMLDetailsElement>('.sc-event-details')!;
    expect(details.open).toBe(false);
    expect(root().textContent).toContain('Потік подій');
    expect(root().textContent).toContain('Показано 1 із 1');
    expect(details.querySelector('pre')!.textContent).toContain('inbound');
    details.querySelector('summary')!.click();
    expect(details.open).toBe(true);
  });
  it('offers a clear-filters action when a search has no matches', () => {
    DebuggerOverlay.log('Звичайна подія', 'Деталі події', undefined, false);
    DebuggerOverlay.show(); click('[data-tab="events"]');
    const search = root().querySelector<HTMLInputElement>('#sc-input-search')!;
    search.value = 'немає такого'; search.dispatchEvent(new Event('input'));
    expect(root().textContent).toContain('Нічого не знайдено');
    click('#btn-reset-event-filters');
    expect(root().querySelectorAll('.sc-event-card')).toHaveLength(1);
    expect(root().querySelector<HTMLButtonElement>('[data-cat="ALL"]')!.getAttribute('aria-pressed')).toBe('true');
  });
  it('renders external prompt, dialogue and response strings as text rather than markup', () => {
    const payload = '<img src=x onerror="alert(1)">';
    const id = DebuggerOverlay.beginAICheck({ sessionId: 'chat-a', text: payload, dialogue: payload, preparedPrompt: payload });
    DebuggerOverlay.finishAICheck(id, 'completed', { ...safe, reasoning: payload, rawResponse: payload,
      requestMessages: [{ role: 'user', content: payload }] }); openAI();
    expect(root().querySelectorAll('.sc-check-detail img')).toHaveLength(0);
    expect(root().textContent).toContain(payload);
    DebuggerOverlay.log(payload, payload, undefined, false); click('[data-tab="events"]');
    expect(root().querySelectorAll('.sc-event-card img')).toHaveLength(0);
  });
});

describe('Bounded history invariants', () => {
  it('protects terminal data and snapshots from mutations and late completion', () => {
    const history = new AICheckHistory(); const check = history.begin({ sessionId: 'a', flags: ['flag'] });
    check.flags!.push('mutation'); history.finish(check.id, 'cancelled');
    expect(history.finish(check.id, 'completed', safe)).toBeNull();
    const snapshot = history.snapshot(); snapshot[0].status = 'completed';
    expect(history.snapshot()[0]).toMatchObject({ status: 'cancelled', flags: ['flag'] });
  });
  it('bounds records and never reuses ids after clear', () => {
    const history = new AICheckHistory(2);
    const first = history.begin({ sessionId: 'a' }); history.begin({ sessionId: 'a' }); history.begin({ sessionId: 'a' });
    expect(history.snapshot()).toHaveLength(2); expect(history.finish(first.id, 'completed', safe)).toBeNull();
    history.clear(); expect(history.begin({ sessionId: 'a' }).id).not.toBe(first.id);
  });
});
