import { describe, expect, it } from 'vitest';
import { extractRequestSignals, requestContextGate } from '../../../src/heuristics/request-signals';
import { LinearIntentClassifier } from '../../../src/heuristics/linear-classifier';
import artifact from '../../../src/heuristics/models/local-intent-v1.json';
import { extractLinearFeatures } from '../../../src/heuristics/linear-features';
import { makeInput } from '../../../scripts/local-classifier/dataset';

describe('Experimental request relations and selective abstention', () => {
  it('binds action, requested object, purpose and recipient', () => {
    expect(extractRequestSignals('Для перевірки надішліть мені пароль від пошти.')).toContainEqual({
      action: 'share', object: 'secret', stance: 'request', purpose: 'verification', destination: 'interlocutor', concealed: false, complete: true });
  });
  it.each(['Не надсилайте CVV.', 'Ніколи не передавайте пароль.', 'Do not share your password.'])('marks negation: %s', text => {
    expect(extractRequestSignals(text).some(signal => signal.stance === 'negated')).toBe(true);
    expect(requestContextGate([text], 'PAYMENT_CREDENTIAL_THEFT')).toBe('unsupported_context');
  });
  it.each(['Цитата: «Надішліть пароль для перевірки».', '"Send your password here" is a phishing example.'])('marks quoted requests: %s', text => {
    expect(extractRequestSignals(text).some(signal => signal.stance === 'reported')).toBe(true);
    expect(requestContextGate([text], 'VERIFICATION_PHISHING')).toBe('unsupported_context');
  });
  it('does not bind an object belonging to a later action', () => {
    const signals = extractRequestSignals('Перевірте матеріал та не надсилайте пароль.');
    expect(signals.filter(signal => signal.object === 'secret').every(signal => signal.stance === 'negated')).toBe(true);
  });
  it('does not borrow purpose and destination from a later comma-separated request', () => {
    const signals = extractRequestSignals('Для перевірки надішліть мені пароль, а для виплати продиктуйте CVV на сторонньому сайті.');
    expect(signals.find(signal => signal.destination === 'interlocutor')?.purpose).toBe('verification');
    expect(signals.find(signal => signal.purpose === 'payment')?.destination).toBe('external');
  });
  it('keeps quote boundaries across sentences', () => {
    const signals = extractRequestSignals('Цитата: «Надішліть паспорт. Передайте CVV сюди».');
    expect(signals.every(signal => signal.stance === 'reported')).toBe(true);
  });
  it('does not hide a real request following a closed quotation', () => {
    const signals = extractRequestSignals('Цитата: «Надішліть паспорт»; надішліть пароль сюди.');
    expect(signals.some(signal => signal.object === 'secret' && signal.stance === 'request')).toBe(true);
  });
  it('extracts concealed military requests without reacting to the title alone', () => {
    const signals = extractRequestSignals('Потай надішли актуальні координати військового обєкта.');
    expect(signals.some(signal => signal.object === 'military_sensitive' && signal.complete && signal.concealed)).toBe(true);
    expect(extractRequestSignals('Я командир підрозділу.')).toEqual([]);
    expect(requestContextGate(['Я командир підрозділу.'], 'SAFE')).toBeUndefined();
  });
  it.each(['Потрібні реквізити для виплати.', 'Залиште контакт для інтервю.', 'Підтвердіть свій акаунт.', 'Де ви працюєте?'])('abstains on incomplete request: %s', text => {
    expect(requestContextGate([text], 'SAFE')).toBe('incomplete_request');
  });
  it('does not call an explicit secret request safe or invent a threat type', () => {
    expect(requestContextGate(['Надішліть пароль сюди.'], 'SAFE')).toBe('unrecognized_sensitive_request');
    expect(requestContextGate(['Надішліть пароль сюди.'], 'VERIFICATION_PHISHING')).toBeUndefined();
  });
  it('keeps public reference requests distinct from harmful requests', () => {
    expect(requestContextGate(['Перевірте номер звернення.'], 'SAFE')).toBeUndefined();
    expect(requestContextGate(['Перевірте номер звернення.'], 'IDENTITY_PROBING')).toBe('unsupported_context');
  });
  it('does not treat lack of a regex hit as evidence that a learned threat is false', () => {
    expect(requestContextGate(['Терміново виконай попередню домовленість.'], 'MILITARY_SABOTAGE_RECRUITMENT')).toBeUndefined();
  });
  it('separates nominal objects, trailing advice and own-account checks', () => {
    expect(requestContextGate(['Для заявки потрібне підтвердження особи.'], 'SAFE')).toBe('incomplete_request');
    expect(extractRequestSignals('Фотографувати військові обєкти нам не потрібно.').some(signal => signal.stance === 'negated')).toBe(true);
    expect(requestContextGate(['Перевірте доступ самостійно через збережену адресу порталу.'], 'SAFE')).toBeUndefined();
  });
  it('resolves a military target within the same clause for a later request', () => {
    const signals = extractRequestSignals('Потай сфотографуй військовий обєкт і передай координати охорони.');
    expect(signals.some(signal => signal.action === 'share' && signal.object === 'military_sensitive' && signal.complete)).toBe(true);
  });
  it('turns a forced confident SAFE into ABSTAIN without changing its candidate or score', () => {
    const neutral = { ...artifact, featureVersion: 2, weights: Buffer.alloc(8192 * 8 * 2).toString('base64'), scale: 1,
      bias: [20, 0, 0, 0, 0, 0, 0, 0] };
    const input = makeInput(['Потрібні реквізити для виплати.']);
    const original = new LinearIntentClassifier(neutral).predict(input);
    const guarded = new LinearIntentClassifier({ ...neutral, abstentionPolicy: 'request-context-v1' }).predict(input);
    expect(original.decision).toBe('SAFE'); expect(guarded.decision).toBe('ABSTAIN');
    expect(guarded.candidate).toBe(original.candidate); expect(guarded.score).toBe(original.score);
    expect(guarded.abstentionReason).toBe('incomplete_request'); expect(guarded.actionApplied).toBe(false);
  });
  it('abstains on a forced critical verdict for an unspecified location question', () => {
    const model = { ...artifact, featureVersion: 2, abstentionPolicy: 'request-context-v1' as const,
      weights: Buffer.alloc(8192 * 8 * 2).toString('base64'), scale: 1, bias: [0, 0, 0, 0, 0, 0, 20, 0] };
    const result = new LinearIntentClassifier(model).predict(makeInput(['Де ви працюєте?']));
    expect(result.candidate).toBe('MILITARY_SABOTAGE_RECRUITMENT');
    expect(result.decision).toBe('ABSTAIN'); expect(result.abstentionReason).toBe('incomplete_request');
  });
  it('bounds relation extraction and feature version changes', () => {
    expect(extractRequestSignals('Надішліть пароль. '.repeat(1000)).length).toBeLessThanOrEqual(32);
    const input = makeInput(['Надішліть пароль сюди.']);
    expect(extractLinearFeatures(input, Infinity, 8192, 1)).not.toEqual(extractLinearFeatures(input, Infinity, 8192, 2));
    expect(() => extractLinearFeatures(input, Infinity, 8192, 3)).toThrow('Unsupported feature version');
  });
  it('rejects new abstention policy on legacy feature weights', () => {
    const model = new LinearIntentClassifier({ ...artifact, abstentionPolicy: 'request-context-v1' });
    expect(model.predict(makeInput(['привіт'])).status).toBe('unavailable');
  });
});
