import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSessionState } from '../../../src/heuristics/chat-session-state';
import { getThreatMitigationAction } from '../../../src/heuristics/threat-mitigation-policy';

describe('Speaker isolation and age of chat evidence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T08:00:00Z'));
    ChatSessionState.reset();
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    'Надішліть вашу сід-фразу для відновлення гаманця.',
    'Сфотографуй будівлю ТЦК, плачу за фото.',
    'Щоб отримати оплату, введіть CVV на https://fake.example.invalid.',
  ])('keeps an outgoing quote out of both detection engines: %s', (text) => {
    const outgoing = ChatSessionState.addMessageAndEvaluate(text, 'outbound');
    expect(outgoing.hasFormedIntent).toBe(false);
    expect(outgoing.matchedSpans).toEqual([]);
    expect(outgoing.clustersDetected).toEqual([]);
    const next = ChatSessionState.addMessageAndEvaluate('Привіт, коли можна оглянути товар?', 'inbound');
    expect(getThreatMitigationAction(next.hasFormedIntent, next.intentType)).toBe('ALLOW');
    expect(next.telemetry?.rawText).not.toContain(text);
    expect(ChatSessionState.getDialogueHistory()).toContain(`[Ви]: ${text}`);
    expect(ChatSessionState.getRecentMessages()[0].matchedSpans).toEqual([]);
  });

  it('does not complete an interlocutor pattern using the user’s payment words', () => {
    ChatSessionState.addMessageAndEvaluate('Оформимо OLX доставку.', 'inbound');
    const result = ChatSessionState.addMessageAndEvaluate('Для отримання коштів дам IBAN.', 'outbound');
    expect(result.hasFormedIntent).toBe(false);
    expect(result.clustersDetected).not.toContain('payment_claim');
    expect(result.telemetry?.rawText).not.toContain('IBAN');
  });

  it('keeps a real recent incoming threat when the user replies', () => {
    const threat = ChatSessionState.addMessageAndEvaluate('Надішліть вашу сід-фразу для відновлення гаманця.', 'inbound');
    const timestamp = ChatSessionState.getRecentMessages()[0].timestamp;
    vi.advanceTimersByTime(30_000);
    const reply = ChatSessionState.addMessageAndEvaluate('Why do you need that?', 'outbound');
    expect(reply.intentType).toBe(threat.intentType);
    expect(reply.confidence).toBe(threat.confidence);
    expect(reply.detectedLanguage).toBe(threat.detectedLanguage);
    expect(ChatSessionState.getRecentMessages()[0].timestamp).toBe(timestamp);
  });

  it('still combines two recent incoming fragments across a user reply', () => {
    ChatSessionState.addMessageAndEvaluate('Для отримання коштів.', 'inbound');
    ChatSessionState.addMessageAndEvaluate('Як це зробити?', 'outbound');
    vi.advanceTimersByTime(20_000);
    const result = ChatSessionState.addMessageAndEvaluate('Ось посилання https://example.invalid/claim.', 'inbound');
    expect(result.intentType).toBe('ESCROW_DELIVERY_SCAM');
  });

  it('decreases the confidence of a delayed multi-message pattern', () => {
    ChatSessionState.addMessageAndEvaluate('Для отримання коштів.', 'inbound');
    vi.advanceTimersByTime(3 * 60_000);
    const result = ChatSessionState.addMessageAndEvaluate('Ось посилання https://example.invalid/claim.', 'inbound');
    expect(result.intentType).toBe('ESCROW_DELIVERY_SCAM');
    expect(result.confidence).toBeLessThan(60);
    expect(result.confidence).toBeGreaterThanOrEqual(45);
  });

  it('does not complete a payout lure using old fragments', () => {
    ChatSessionState.addMessageAndEvaluate('Для отримання коштів.', 'inbound');
    vi.advanceTimersByTime(6 * 60_000);
    const result = ChatSessionState.addMessageAndEvaluate('Ось посилання https://example.invalid/claim.', 'inbound');
    expect(result.hasFormedIntent).toBe(false);
  });

  it.each([
    'Надішліть вашу сід-фразу для відновлення гаманця.',
    'Сфотографуй будівлю ТЦК, плачу за фото.',
  ])('does not renew old blocking evidence with outgoing replies: %s', (text) => {
    const initial = ChatSessionState.addMessageAndEvaluate(text, 'inbound');
    expect(getThreatMitigationAction(initial.hasFormedIntent, initial.intentType)).toBe('LOCK_INPUT');
    vi.advanceTimersByTime(6 * 60_000);
    const result = ChatSessionState.addMessageAndEvaluate('Дякую, я зрозумів.', 'outbound');
    expect(getThreatMitigationAction(result.hasFormedIntent, result.intentType)).toBe('ALLOW');
  });

  it.each([0, 6 * 60_000])('weights semantic-only military context by age (%i ms)', (delay) => {
    ChatSessionState.addMessageAndEvaluate('Військова будівля.', 'inbound');
    vi.advanceTimersByTime(delay);
    const result = ChatSessionState.addMessageAndEvaluate('Шукаємо людей на підробіток, оплата у криптовалюті.', 'inbound');
    expect(result.hasFormedIntent).toBe(delay === 0);
    if (delay === 0) expect(result.intentType).toBe('MILITARY_SABOTAGE_RECRUITMENT');
    else expect(result.telemetry?.recencySupport).toBeLessThanOrEqual(0.5);
  });

  it('does not let old unrelated greetings dilute fresh critical evidence', () => {
    ChatSessionState.addMessageAndEvaluate('Вітаю.', 'inbound');
    vi.advanceTimersByTime(12 * 60_000);
    const result = ChatSessionState.addMessageAndEvaluate('Сфотографуй будівлю ТЦК, плачу за фото.', 'inbound');
    expect(getThreatMitigationAction(result.hasFormedIntent, result.intentType)).toBe('LOCK_INPUT');
  });

  it('bounds each speaker separately so user messages cannot evict incoming evidence', () => {
    ChatSessionState.addMessageAndEvaluate('Для отримання коштів.', 'inbound');
    for (let i = 0; i < 35; i++) ChatSessionState.addMessageAndEvaluate(`Власна репліка ${i}`, 'outbound');
    expect(ChatSessionState.getRecentMessages().filter((message) => message.direction === 'outbound')).toHaveLength(30);
    expect(ChatSessionState.getRecentMessages().filter((message) => message.direction === 'inbound')).toHaveLength(1);
    const result = ChatSessionState.addMessageAndEvaluate('Ось посилання https://example.invalid/claim.', 'inbound');
    expect(result.intentType).toBe('ESCROW_DELIVERY_SCAM');
  });

  it('expires evidence at exactly fifteen minutes and excludes future timestamps after a clock reversal', () => {
    ChatSessionState.addMessageAndEvaluate('Надішліть вашу сід-фразу.', 'inbound');
    vi.advanceTimersByTime(15 * 60_000);
    expect(ChatSessionState.getRecentMessages()).toEqual([]);
    ChatSessionState.addMessageAndEvaluate('Надішліть вашу сід-фразу.', 'inbound');
    vi.setSystemTime(Date.now() - 60_000);
    const result = ChatSessionState.addMessageAndEvaluate('Вітаю.', 'inbound');
    expect(result.hasFormedIntent).toBe(false);
    expect(ChatSessionState.getRecentMessages()).toHaveLength(1);
  });

  it('clears both dialogue directions and saved AI state on reset', () => {
    ChatSessionState.addMessageAndEvaluate('Привіт.', 'inbound');
    ChatSessionState.addMessageAndEvaluate('Вітаю.', 'outbound');
    ChatSessionState.sessionLlmVerdict = 'SCAM';
    ChatSessionState.reset();
    expect(ChatSessionState.getRecentMessages()).toEqual([]);
    expect(ChatSessionState.getDialogueHistory()).toBe('');
    expect(ChatSessionState.sessionLlmVerdict).toBeNull();
  });
});
