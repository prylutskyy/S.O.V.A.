import { describe, it, expect, beforeEach } from 'vitest';
import { OutboundDataSanitizer } from '../../../src/privacy/outbound-data-sanitizer';
import { PersonalVaultManager } from '../../../src/core/personal-vault';
import { VaultItem } from '../../../src/types/vault';

describe('OutboundDataSanitizer (Zero-Knowledge Privacy Guard)', () => {
  const sampleVaultItems: VaultItem[] = [
    {
      id: 'vault-tax-id',
      category: 'TAX_ID',
      label: 'РНОКПП (ІПН)',
      realValue: '3124567890',
      decoyValue: '2987654321',
      keywords: ['рнокпп', 'іпн'],
      createdAt: Date.now(),
      enabled: true,
    },
    {
      id: 'vault-maiden-name',
      category: 'MOTHER_MAIDEN_NAME',
      label: 'Дівоче прізвище матері',
      realValue: 'Шевченко',
      decoyValue: 'Коваленко',
      keywords: ['дівоче', 'прізвище'],
      createdAt: Date.now(),
      enabled: true,
    },
    {
      id: 'vault-secret-word',
      category: 'SECRET_WORD',
      label: 'Секретне слово банку',
      realValue: 'Барселона2024',
      decoyValue: 'Мадрид1998',
      keywords: ['кодове слово', 'секретне слово'],
      createdAt: Date.now(),
      enabled: true,
    },
  ];

  beforeEach(() => {
    // Налаштовуємо мок елементів сховища
    // @ts-ignore
    PersonalVaultManager.cachedItems = sampleVaultItems;
  });

  describe('Card Number Redaction (PAN)', () => {
    it('should replace valid Visa card with verified placeholder and set telemetry', () => {
      const text = 'Ось моя картка для оплати: 4149 4390 1234 5678, чекаю гроші!';
      const result = OutboundDataSanitizer.sanitize(text);

      expect(result.sanitizedText).not.toContain('4149 4390 1234 5678');
      expect(result.sanitizedText).not.toContain('4149439012345678');
      expect(result.sanitizedText).toContain('[VERIFIED_CARD_NUMBER_1]');
      expect(result.telemetry.hasValidPaymentCard).toBe(true);
      expect(result.telemetry.cardBrand).toBe('Visa');
      expect(result.telemetry.cardCount).toBe(1);
      expect(result.isFullyAnonymized).toBe(true);
    });

    it('should replace Mastercard with proper brand detection', () => {
      const text = 'Моя картка 5555 5555 5555 4444';
      const result = OutboundDataSanitizer.sanitize(text);

      expect(result.sanitizedText).toContain('[VERIFIED_CARD_NUMBER_1]');
      expect(result.sanitizedText).not.toContain('5555 5555 5555 4444');
      expect(result.telemetry.cardBrand).toBe('Mastercard');
    });
  });

  describe('CVV & Expiry Redaction', () => {
    it('should redact CVV and Expiry in card dialogue draft', () => {
      const text = 'Картка 4149 4390 1234 5678, діє до 08/28, cvv 789';
      const result = OutboundDataSanitizer.sanitize(text);

      expect(result.sanitizedText).not.toContain('789');
      expect(result.sanitizedText).not.toContain('08/28');
      expect(result.sanitizedText).toContain('[VERIFIED_CVV_CODE]');
      expect(result.sanitizedText).toContain('[VERIFIED_EXPIRY_DATE]');
      expect(result.telemetry.hasCvv).toBe(true);
      expect(result.telemetry.hasCardExpiry).toBe(true);
    });
  });

  describe('SMS OTP Code Redaction', () => {
    it('should redact one-time bank approval SMS codes', () => {
      const text = 'Мені надійшов код з смс 849201, пересилаю вам';
      const result = OutboundDataSanitizer.sanitize(text);

      expect(result.sanitizedText).not.toContain('849201');
      expect(result.sanitizedText).toContain('[VERIFIED_SMS_OTP_CODE]');
      expect(result.telemetry.hasOtp).toBe(true);
    });
  });

  describe('Personal Vault Secrets Redaction', () => {
    it('should redact Tax ID (IPN) and Mother Maiden Name with dedicated tokens', () => {
      const text = 'Мій податковий номер 3124567890, а дівоче прізвище матері — Шевченко, перевірте';
      const result = OutboundDataSanitizer.sanitize(text);

      expect(result.sanitizedText).not.toContain('3124567890');
      expect(result.sanitizedText).not.toContain('Шевченко');
      expect(result.sanitizedText).toContain('[VERIFIED_GOVERNMENT_TAX_ID]');
      expect(result.sanitizedText).toContain('[VERIFIED_MOTHER_MAIDEN_NAME]');
      expect(result.telemetry.vaultMarkersDetected.length).toBe(2);
      expect(result.telemetry.totalSensitiveAssetsRedacted).toBe(2);
    });

    it('should redact secret bank codeword', () => {
      const text = 'Моє секретне слово для банку Барселона2024';
      const result = OutboundDataSanitizer.sanitize(text);

      expect(result.sanitizedText).not.toContain('Барселона2024');
      expect(result.sanitizedText).toContain('[VERIFIED_BANK_SECRET_WORD]');
    });
  });

  describe('Composite Zero-Knowledge Leakage Test', () => {
    it('should guarantee that NO genuine credentials or secrets remain in the final string', () => {
      const sensitiveText = `
        Доброго дня!
        Ось моя картка: 4149 4390 1234 5678
        Код безпеки: 914
        Термін дії: 12/28
        Мій ІПН: 3124567890
        Дівоче прізвище: Шевченко
        Код підтвердження: код з смс 954120
      `;

      const result = OutboundDataSanitizer.sanitize(sensitiveText);

      // Жодне реальне значення не повинно бути присутнім
      expect(result.sanitizedText).not.toContain('4149');
      expect(result.sanitizedText).not.toContain('914');
      expect(result.sanitizedText).not.toContain('12/28');
      expect(result.sanitizedText).not.toContain('3124567890');
      expect(result.sanitizedText).not.toContain('Шевченко');
      expect(result.sanitizedText).not.toContain('954120');

      expect(result.telemetry.hasValidPaymentCard).toBe(true);
      expect(result.telemetry.hasCvv).toBe(true);
      expect(result.telemetry.hasCardExpiry).toBe(true);
      expect(result.telemetry.hasOtp).toBe(true);
      expect(result.telemetry.vaultMarkersDetected.length).toBe(2);
      expect(result.isFullyAnonymized).toBe(true);
    });
  });

  describe('buildCloudPrompt', () => {
    it('compact prompt preserves earlier context and points to an existing trigger without duplicating snapshots', () => {
      const latest = 'Надішліть редактору пароль.';
      const history = `[Співрозмовник]: Я журналіст.\n[Ви]: Навіщо?\n[Співрозмовник]: ${latest}`;
      const prompt = OutboundDataSanitizer.buildCloudPrompt(OutboundDataSanitizer.sanitize(latest), {
        dialogueHistory: history,
        dialogueMessages: [{ speaker: 'interlocutor', text: latest, observedAgeMs: 0 }],
      }, 'compact');
      const evidence = JSON.parse(prompt.split('EVIDENCE_JSON:\n')[1]);
      expect(evidence.dialogueHistory).toBe(history);
      expect(evidence.triggerLine).toBe(2);
      expect(evidence.latestMessage).toBeUndefined();
      expect(evidence.messages).toBeUndefined();
      expect(evidence.observedMessages).toBeUndefined();
    });

    it('compact snapshot keeps structured roles and actual repeated messages when no DOM history exists', () => {
      const messages = [
        { speaker: 'interlocutor' as const, text: 'Повтори пароль.', observedAgeMs: 10000 },
        { speaker: 'user' as const, text: 'Ні.', observedAgeMs: 5000 },
        { speaker: 'interlocutor' as const, text: 'Повтори пароль.', observedAgeMs: 0 },
      ];
      const prompt = OutboundDataSanitizer.buildCloudPrompt(OutboundDataSanitizer.sanitize('Повтори пароль.'), {
        dialogueMessages: messages,
      }, 'compact');
      const evidence = JSON.parse(prompt.split('EVIDENCE_JSON:\n')[1]);
      expect(evidence.messages).toEqual(messages);
      expect(evidence.triggerIndex).toBe(2);
      expect(evidence.latestMessage).toBeUndefined();
    });

    it('compact keeps the explicit trigger if it is not present in history', () => {
      const prompt = OutboundDataSanitizer.buildCloudPrompt(OutboundDataSanitizer.sanitize('Нова репліка.'), {
        dialogueHistory: '[Ви]: Доброго дня.',
      }, 'compact');
      const evidence = JSON.parse(prompt.split('EVIDENCE_JSON:\n')[1]);
      expect(evidence.latestMessage).toBe('Нова репліка.');
      expect(evidence.triggerLine).toBeUndefined();
    });

    it('should build structured prompt containing telemetry flags and sanitized text', () => {
      const payload = OutboundDataSanitizer.sanitize('Ось картка 4149 4390 1234 5678 та код cvv 123');
      const prompt = OutboundDataSanitizer.buildCloudPrompt(payload, {
        sourcePlatform: 'olx.ua',
        targetHost: 'pay-delivery-fake.xyz',
        scenarioRule: 'Check for escrow theft',
      });

      expect(prompt).toContain('"hasValidPaymentCard":true');
      expect(prompt).toContain('"hasCvv":true');
      expect(prompt).toContain('"sourcePlatform":"olx.ua"');
      expect(prompt).toContain('"targetHost":"pay-delivery-fake.xyz"');
      expect(prompt).toContain('[VERIFIED_CARD_NUMBER_1]');
      expect(prompt).toContain('[VERIFIED_CVV_CODE]');
      expect(prompt).not.toContain('4149 4390 1234 5678');
      expect(prompt).not.toContain('123');
    });

    it('does not forward a local verdict, scenario rule or categorical warning as evidence', () => {
      const payload = OutboundDataSanitizer.sanitize('Не надсилайте пароль незнайомцям.');
      const context = { intentType: 'MILITARY_SABOTAGE_RECRUITMENT',
        scenarioRule: 'assume recruitment', raisedFlags: ['Виявлено загрозу'],
        detectedKeywords: ['пароль'], dialogueHistory: '[Співрозмовник]: Порада безпеки.' };
      const prompt = OutboundDataSanitizer.buildCloudPrompt(payload, context);
      expect(prompt).not.toContain('assume recruitment');
      expect(prompt).not.toContain('Виявлено загрозу');
      expect(prompt).not.toContain('"intentType"');
      expect(prompt).toContain('fallible');
      expect(prompt).toContain('[Співрозмовник]');
      const textOnly = OutboundDataSanitizer.buildCloudPrompt(payload, context, 'text-only');
      expect(textOnly).not.toContain('localObservations');
      expect(textOnly).toContain(payload.sanitizedText);
      expect(OutboundDataSanitizer.buildCloudPrompt(payload, context, 'legacy')).toContain('assume recruitment');
    });
  });
});
