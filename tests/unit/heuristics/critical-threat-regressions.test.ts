import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChatSessionState } from '../../../src/heuristics/chat-session-state';
import { getThreatMitigationAction } from '../../../src/heuristics/threat-mitigation-policy';

type CriticalCase = {
  id: string;
  messages: Array<{ speaker: 'user' | 'interlocutor'; text: string }>;
  expected: { intentType: string };
};

const targetIds = [
  'dev2-crypto-002', 'reg-crypto-001', 'reg2-crypto-001', 'reg2-crypto-002',
  'reg2-crypto-005', 'reg2-crypto-006', 'dev2-military-004',
  'reg2-military-003', 'reg2-military-004', 'reg2-military-005', 'reg2-military-006',
];
const cases = ['development', 'regressions'].flatMap((split) =>
  (JSON.parse(readFileSync(resolve(`tests/evaluation/corpus/${split}.json`), 'utf8')).cases as CriticalCase[])
).filter((entry) => targetIds.includes(entry.id));

describe('Critical threat regressions through the chat pipeline', () => {
  beforeEach(() => ChatSessionState.clear());

  it('includes all eleven previously missed cases', () => {
    expect(cases.map((entry) => entry.id).sort()).toEqual([...targetIds].sort());
  });

  it.each(cases)('$id detects the correct threat and locks input', (entry) => {
    let result = ChatSessionState.addMessageAndEvaluate('', 'inbound');
    for (const message of entry.messages) {
      result = ChatSessionState.addMessageAndEvaluate(
        message.text, message.speaker === 'user' ? 'outbound' : 'inbound',
      );
    }
    expect(result.hasFormedIntent).toBe(true);
    expect(result.intentType).toBe(entry.expected.intentType);
    expect(getThreatMitigationAction(result.hasFormedIntent, result.intentType)).toBe('LOCK_INPUT');
  });

  it.each([
    'Надайте вашу мнемонічну фразу для перевірки гаманця.',
    'Повідомте свій приватний ключ гаманця.',
    'Пришлите свою резервную фразу для восстановления кошелька.',
    'Please share your private key to recover your wallet.',
    'Надішліть secret recovery phrase для синхронізації гаманця.',
  ])('recognizes a paraphrased crypto request: %s', (text) => {
    const result = ChatSessionState.addMessageAndEvaluate(text, 'inbound');
    expect(result.intentType).toBe('CRYPTO_WALLET_COMPROMISE');
    expect(getThreatMitigationAction(result.hasFormedIntent, result.intentType)).toBe('LOCK_INPUT');
  });

  it.each([
    'Не надсилайте seed phrase стороннім особам.',
    'Ніколи не повідомте приватний ключ гаманця стороннім особам.',
    'Не вводьте вашу сід-фразу на сторонніх сайтах.',
    'Do not send your seed phrase to support.',
    'Never share your private key with anyone.',
    'Підтримка ніколи не просить ввести вашу сід-фразу.',
    'Support never asks you to send your seed phrase.',
    'Мнемонічна фраза потрібна для локального відновлення власного гаманця.',
    'Приватний ключ слід зберігати офлайн.',
    'Надішліть публічну адресу гаманця для переказу.',
    'Шукаємо кур’єра для доставки документів, оплата щотижня.',
    'We pay couriers to deliver parcels to customers.',
    'The news discusses reconnaissance information about military sites.',
    'Знайдіть графік руху автобусів та передайте його нам.',
    'Допоможіть відремонтувати військовий транспорт, витрати компенсуємо.',
    'Зніміть на відео систему поливу та позначте місце на мапі.',
    'Не допоможіть пошкодити військовий транспорт.',
  ])('does not lock a benign counterpart: %s', (text) => {
    const result = ChatSessionState.addMessageAndEvaluate(text, 'inbound');
    expect(getThreatMitigationAction(result.hasFormedIntent, result.intentType)).toBe('ALLOW');
  });

  it('does not suppress a real request following safety advice', () => {
    const result = ChatSessionState.addMessageAndEvaluate(
      'Ніколи не надсилайте seed phrase незнайомцям. Але надішліть seed phrase мені для перевірки.',
      'inbound',
    );
    expect(result.intentType).toBe('CRYPTO_WALLET_COMPROMISE');
    expect(getThreatMitigationAction(result.hasFormedIntent, result.intentType)).toBe('LOCK_INPUT');
  });
});
