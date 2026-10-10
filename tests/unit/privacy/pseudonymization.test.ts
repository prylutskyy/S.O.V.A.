import { beforeEach, describe, expect, it } from 'vitest';
import { OutboundDataSanitizer as Sanitizer } from '../../../src/privacy/outbound-data-sanitizer';
import { PseudonymizationContext } from '../../../src/privacy/pseudonymization-context';
import { PersonalVaultManager } from '../../../src/core/personal-vault';
import corpus from '../../fixtures/privacy-dialogues.json';

describe('Cloud dialogue privacy boundary', () => {
  beforeEach(() => { (PersonalVaultManager as any).cachedItems = []; });
  it.each(corpus.cases)('privacy corpus: $id', example => {
    const output = Sanitizer.sanitize(example.text).sanitizedText;
    for (const secret of example.forbidden) expect(output).not.toContain(secret);
    for (const meaning of example.preserved) expect(output).toContain(meaning);
  });
  const cases = [
    ['phone', 'Телефон +380 (67) 123-45-67', '123-45-67', 'PHONE'],
    ['international phone', 'Call +44 7700 900123', '900123', 'PHONE'],
    ['email', 'Надішліть на olena@example.invalid', 'olena@', 'EMAIL'],
    ['handle', 'Пишіть @private_user', '@private_user', 'HANDLE'],
    ['name', 'Мене звати Іван Петренко.', 'Іван Петренко', 'PERSON'],
    ['English name', 'My name is Alice Smith.', 'Alice Smith', 'PERSON'],
    ['third person', 'Передайте Олена Коваль документ', 'Олена Коваль', 'PERSON'],
    ['address', 'Адреса проживання: Київ, вул. Миру 12, кв. 7', 'Миру', 'ADDRESS'],
    ['street', 'Зустріч біля вул. Миру 12, кв. 7', 'Миру', 'ADDRESS'],
    ['coordinates', 'Точка 50.450123, 30.523456', '50.450123', 'COORDINATES'],
    ['invalid card', 'Картка 4111 1111 1111 1112', '4111', 'CARD_CANDIDATE'],
    ['IBAN', 'IBAN UA213223130000026007233566001', 'UA213', 'IBAN'],
    ['passport', 'Паспорт: AB123456', 'AB123456', 'IDENTITY_DATA'],
    ['tax id', 'ІПН: 1234567890', '1234567890', 'IDENTITY_DATA'],
    ['birth date', 'Дата народження: 12.03.1995', '12.03.1995', 'IDENTITY_DATA'],
    ['URL credentials', 'https://alice:secret@example.invalid/verify?email=alice%40example.invalid#token', 'alice', 'URL_DATA'],
    ['URL token', 'https://example.invalid/verify?token=private123', 'private123', 'URL_DATA'],
    ['API token', 'Ключ gsk_abcdefghijklmnopqrstuvwxyz123456789', 'abcdefghijklmnopqrstuvwxyz', 'API_KEY'],
    ['invisible separators', 'a\u200Blice@example.invalid', 'alice@', 'EMAIL'],
  ];
  it.each(cases)('redacts %s', (_, text, secret, marker) => {
    const output = Sanitizer.sanitize(text).sanitizedText;
    expect(output).not.toContain(secret);
    expect(output).toContain(`[${marker}_`);
  });
  it('keeps two people distinct and repetitions stable across evidence fields', () => {
    const privacySession = new PseudonymizationContext();
    const history = Sanitizer.sanitize('[Ви]: Мене звати Іван Петренко.\n[Співрозмовник]: Я Олена Коваль.', { privacySession }).sanitizedText;
    expect(history).toContain('[PERSON_1]'); expect(history).toContain('[PERSON_2]');
    const payload = Sanitizer.sanitize('Іван Петренко, надішліть пароль.', { privacySession });
    expect(payload.sanitizedText).toContain('[PERSON_1]');
    const prompt = Sanitizer.buildCloudPrompt(payload, { privacySession, dialogueHistory: history });
    expect(prompt).not.toMatch(/Іван|Петренко|Олена|Коваль/);
    expect(prompt).toContain('[Ви]'); expect(prompt).toContain('[Співрозмовник]');
  });
  it('keeps card identities consistent despite ordering and format differences', () => {
    const privacySession = new PseudonymizationContext();
    const history = Sanitizer.sanitize('4111111111111111 та 5555555555554444', { privacySession });
    const latest = Sanitizer.sanitize('5555 5555 5555 4444', { privacySession });
    expect(history.sanitizedText).toContain('[VERIFIED_CARD_NUMBER_2]');
    expect(latest.sanitizedText).toBe('[VERIFIED_CARD_NUMBER_2]');
  });
  it('redacts all distinct and repeated secrets', () => {
    const result = Sanitizer.sanitize('CVV: 123; CVV: 456; OTP: 654321; OTP: 789012; пароль: SecretOne; пароль: SecretTwo');
    for (const value of ['123', '456', '654321', '789012', 'SecretOne', 'SecretTwo']) expect(result.sanitizedText).not.toContain(value);
    expect(result.telemetry.hasCvv).toBe(true); expect(result.telemetry.hasOtp).toBe(true);
    expect(result.telemetry.hasPassword).toBe(true);
  });
  it('resets identity numbering on clear', () => {
    const session = new PseudonymizationContext();
    expect(session.token('PERSON', 'Alice')).toBe('[PERSON_1]');
    expect(session.token('PERSON', 'Bob')).toBe('[PERSON_2]'); session.clear();
    expect(session.token('PERSON', 'Bob')).toBe('[PERSON_1]');
    expect(session.replaceKnown('Alice')).toBe('Alice');
  });
  it('preserves address identity through repeated sanitization and the final prompt boundary', () => {
    const privacySession = new PseudonymizationContext();
    const original = 'Адреса: вул. Миру 12; адреса: вул. Сонячна 25.';
    const first = Sanitizer.sanitize(original, { privacySession }).sanitizedText;
    expect(first).toContain('[ADDRESS_1]');
    expect(first).toContain('[ADDRESS_2]');
    expect(Sanitizer.sanitize(first, { privacySession }).sanitizedText).toBe(first);
    const prompt = Sanitizer.buildCloudPrompt(Sanitizer.sanitize('Порівняйте дві адреси.', { privacySession }), { privacySession, dialogueHistory: first });
    expect(prompt).toContain('[ADDRESS_1]');
    expect(prompt).toContain('[ADDRESS_2]');
    expect(prompt).not.toContain('[ADDRESS_3]');
  });
  it('does not treat a marker followed by raw address data as already safe', () => {
    const output = Sanitizer.sanitize('Адреса: [ADDRESS_1] вул. Сонячна 25').sanitizedText;
    expect(output).not.toContain('Сонячна');
  });
  it('does not merge unrelated single names or partial words', () => {
    const session = new PseudonymizationContext(); session.token('PERSON', 'Іван');
    expect(session.replaceKnown('Іваненко')).toBe('Іваненко');
    expect(session.replaceKnown('Іван')).toBe('[PERSON_1]');
  });
  it.each(['compact', 'observations', 'text-only', 'legacy'] as const)('cleans every field for %s', variant => {
    const secret = 'alice@example.invalid';
    const prompt = Sanitizer.buildCloudPrompt(Sanitizer.sanitize('Порада: не передавайте OTP.'), {
      dialogueHistory: `[Ви]: ${secret}`, dialogueMessages: [{ speaker: 'user', text: secret, observedAgeMs: 100 }],
      sourcePlatform: secret, targetHost: secret, detectedKeywords: [secret], suspiciousUrls: [`https://example.invalid/?email=${secret}`],
      raisedFlags: [secret], scenarioRule: secret,
    }, variant);
    expect(prompt).not.toContain(secret);
    expect(prompt).toContain('не передавайте OTP');
  });
  it('is idempotent and preserves domain, role, intent, public institutions and negation', () => {
    const text = '[Співрозмовник]: Нова Пошта не просить CVV. https://example.invalid/verify?token=secret';
    const first = Sanitizer.sanitize(text).sanitizedText;
    expect(Sanitizer.sanitize(first).sanitizedText).toBe(first);
    expect(first).toContain('Нова Пошта не просить CVV'); expect(first).toContain('example.invalid');
  });
  it('handles a long synthetic dialogue within a bounded CPU budget', () => {
    const text = Array.from({ length: 100 }, (_, i) => `Email person${i}@example.invalid; телефон +380671234567`).join('\n');
    const start = performance.now(); const result = Sanitizer.sanitize(text);
    expect(result.sanitizedText).not.toContain('@example.invalid');
    expect(performance.now() - start).toBeLessThan(500);
  });
});
