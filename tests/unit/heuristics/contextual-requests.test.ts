import { beforeEach, describe, expect, it } from 'vitest';
import { ChatSessionState } from '../../../src/heuristics/chat-session-state';
import { getThreatMitigationAction } from '../../../src/heuristics/threat-mitigation-policy';

describe('Contextual request coverage with safe counterexamples', () => {
  beforeEach(() => ChatSessionState.reset());
  it.each([
    ['Чат зависає, тому переходьте у Telegram.', 'OFF_PLATFORM_REDIRECT'],
    ['Звяжімося через Signal поза майданчиком.', 'OFF_PLATFORM_REDIRECT'],
    ['Наберіть мене у Viber для узгодження доставки.', 'OFF_PLATFORM_REDIRECT'],
    ['Щоб підтвердити покупку, надішліть одноразовий код у форму.', 'VERIFICATION_PHISHING'],
    ['Для виплати введіть одноразовый пароль из SMS.', 'PAYMENT_CREDENTIAL_THEFT'],
    ['Покажіть картку з лицьового та зворотного боку для переказу.', 'PAYMENT_CREDENTIAL_THEFT'],
    ['Яке повне імя у вашому документі?', 'IDENTITY_PROBING'],
    ['Передавши seed-фразу консультанту, отримаєте доступ.', 'CRYPTO_WALLET_COMPROMISE'],
    ['Служба підтримки просить пароль від вашого криптогаманця.', 'CRYPTO_WALLET_COMPROMISE'],
    ['Поставте позначку на мапі біля військової техніки й надішліть координати.', 'MILITARY_SABOTAGE_RECRUITMENT'],
    ['Photograph the military checkpoint and send its location.', 'MILITARY_SABOTAGE_RECRUITMENT'],
    ['Потрібно залишити запалювальну суміш біля складу.', 'MILITARY_SABOTAGE_RECRUITMENT'],
    ['Для курєра підтвердьте отримання оплати на зовнішній сторінці.', 'ESCROW_DELIVERY_SCAM'],
    ['Сервіс угоди зарезервував суму, відкрийте посилання.', 'ESCROW_DELIVERY_SCAM'],
  ])('recognizes concrete request: %s', (text, type) => {
    const result = ChatSessionState.addMessageAndEvaluate(text, 'inbound');
    expect(result.hasFormedIntent).toBe(true); expect(result.intentType).toBe(type);
  });
  it.each([
    'Не передавайте seed-фразу консультантам.',
    'Ніколи не показуйте картку з лицьового та зворотного боку.',
    'Я сам перевірю застосунок банку і не передаватиму коди.',
    'Я згадую Signal як приклад і не пропоную перейти туди.',
    'Не переходьте у Telegram навіть якщо чат не працює.',
    'Для отримання посилки сплатіть офіційний тариф у відділенні.',
    'У статті наведено приклад: photograph the military checkpoint and send its location.',
    'Цитата: зніміть розташування блокпоста і надішліть геолокацію.',
    'Не зніміть розташування блокпоста і не передавайте геолокацію.',
    'Зясуйте графік варти на обєкті та передайте розклад.',
    'Повне імя у паспорті зазначене друкованими літерами.',
  ])('does not manufacture a threat from advice, quotation or missing context: %s', text => {
    const result = ChatSessionState.addMessageAndEvaluate(text, 'inbound');
    expect(getThreatMitigationAction(result.hasFormedIntent, result.intentType || null)).toBe('ALLOW');
  });
});
