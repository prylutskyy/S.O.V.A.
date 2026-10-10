import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChatSessionState } from '../../../src/heuristics/chat-session-state';
import { getThreatMitigationAction } from '../../../src/heuristics/threat-mitigation-policy';

type Case = {
  id: string;
  messages: Array<{ text: string; speaker: 'user' | 'interlocutor' }>;
  expected: { detected: boolean; intentType: string | null; action: string };
};
const corpusCases = ['development', 'regressions'].flatMap((split) =>
  (JSON.parse(readFileSync(resolve(`tests/evaluation/corpus/${split}.json`), 'utf8')).cases as Case[])
).filter((entry) => ['VERIFICATION_PHISHING', 'PAYMENT_CREDENTIAL_THEFT'].includes(entry.expected.intentType ?? ''));

describe('Verification and payment request context', () => {
  beforeEach(() => ChatSessionState.clear());

  it.each(corpusCases)('$id matches the existing type and action', (entry) => {
    const results = entry.messages.map((message) => ChatSessionState.addMessageAndEvaluate(
      message.text, message.speaker === 'user' ? 'outbound' : 'inbound',
    ));
    const result = results.at(-1)!;
    expect(result.hasFormedIntent).toBe(entry.expected.detected);
    expect(result.intentType ?? null, JSON.stringify({ clusters: result.clustersDetected, normalized: result.normalizedText })).toBe(entry.expected.intentType);
    expect(getThreatMitigationAction(result.hasFormedIntent, result.intentType)).toBe(entry.expected.action);
  });

  it.each([
    ['Щоб перевірити профіль, повідомте код підтвердження.', 'VERIFICATION_PHISHING'],
    ['Щоб отримати оплату, повідомте код підтвердження.', 'PAYMENT_CREDENTIAL_THEFT'],
    ['To verify your profile, send your SMS code.', 'VERIFICATION_PHISHING'],
    ['To receive your payment, send your SMS code.', 'PAYMENT_CREDENTIAL_THEFT'],
    ['Для проверки профиля пришлите код из СМС.', 'VERIFICATION_PHISHING'],
    ['Для получения денег пришлите код из СМС.', 'PAYMENT_CREDENTIAL_THEFT'],
    ['Пройдіть верифікацію картки: надішліть код із SMS.', 'VERIFICATION_PHISHING'],
    ['Для проверки карты пришлите код из СМС.', 'VERIFICATION_PHISHING'],
    ['Щоб отримати оплату, введіть CVV на https://verify.example.invalid/account/verification.', 'PAYMENT_CREDENTIAL_THEFT'],
    ['Підтвердіть профіль: надішліть код із SMS за https://pay.example.invalid.', 'VERIFICATION_PHISHING'],
  ])('resolves purpose independently of the URL: %s', (text, expectedType) => {
    const result = ChatSessionState.addMessageAndEvaluate(text, 'inbound');
    expect(result.intentType).toBe(expectedType);
    expect(getThreatMitigationAction(result.hasFormedIntent, result.intentType)).toBe('WARN');
  });

  it.each([
    'Профіль перевірено, замовлення підтверджено.',
    'Профіль перевірено, замовлення підтверджено. Довідка: https://help.example.invalid.',
    'Не надсилайте код підтвердження для перевірки профілю стороннім особам.',
    'Для отримання оплати достатньо IBAN, CVV не потрібен.',
    'Код підтвердження потрібен лише у вашому офіційному застосунку.',
    'Фото картки з обох боків не можна передавати стороннім людям.',
    'Увійдіть в банк через офіційний застосунок і перевірте баланс самостійно.',
    'Увійдіть в банк на https://bank.example.invalid для перегляду власних рахунків.',
    'Для перевірки профілю відкрийте налаштування у власному кабінеті.',
  ])('allows a benign verification/payment message: %s', (text) => {
    const result = ChatSessionState.addMessageAndEvaluate(text, 'inbound');
    expect(getThreatMitigationAction(result.hasFormedIntent, result.intentType), JSON.stringify({ clusters: result.clustersDetected, type: result.intentType })).toBe('ALLOW');
  });

  it('does not let an old verification pretext override a new payout request', () => {
    ChatSessionState.addMessageAndEvaluate('Потрібна перевірка профілю.', 'inbound');
    const result = ChatSessionState.addMessageAndEvaluate('Для отримання оплати надішліть CVV.', 'inbound');
    expect(result.intentType).toBe('PAYMENT_CREDENTIAL_THEFT');
  });
});
