import { describe, it, expect } from 'vitest';
import { SensitiveAssetDetector } from '../src/heuristics/sensitive-asset-detector';
import { VaultItem } from '../src/types/vault';

describe('SensitiveAssetDetector (TDD Unit Suite)', () => {
  // ── 1. Звичайні безпечні повідомлення ──────────────────────────────────────
  describe('Звичайні повідомлення та навігація (Safe Conversational Text)', () => {
    it('дозволяє звичайний текст у чаті без перешкод', () => {
      const result = SensitiveAssetDetector.evaluateOutboundPayload({
        text: 'Доброго дня! Чи актуальне ще оголошення про продаж ноутбука?',
      });

      expect(result.shouldBlock).toBe(false);
      expect(result.action).toBe('ALLOW');
      expect(result.riskLevel).toBe('SAFE');
      expect(result.detectedAssets.hasCard).toBe(false);
      expect(result.detectedAssets.hasCvv).toBe(false);
      expect(result.detectedAssets.hasExpiry).toBe(false);
      expect(result.detectedAssets.hasOtp).toBe(false);
    });

    it('дозволяє відмову або відповідь на підозрілі пропозиції', () => {
      const result = SensitiveAssetDetector.evaluateOutboundPayload({
        text: 'Ні, я не буду переходити за стороннім посиланням. Оформлюйте тільки через OLX Доставку.',
      });

      expect(result.shouldBlock).toBe(false);
      expect(result.action).toBe('ALLOW');
      expect(result.riskLevel).toBe('SAFE');
    });

    it('дозволяє передачу реквізитів звичайної доставки (ПІБ, адреса, відділення)', () => {
      const result = SensitiveAssetDetector.evaluateOutboundPayload({
        text: 'Олександр Прилуцький, м. Київ, відділення Нової Пошти №15, тел: 0991234567',
      });

      expect(result.shouldBlock).toBe(false);
      expect(result.action).toBe('ALLOW');
    });
  });

  // ── 2. Передача номера картки (PAN) для P2P ──────────────────────────────
  describe('Номер банківської картки (PAN) для P2P переказу', () => {
    it('дозволяє передачу 16-значного номера картки без CVV та терміну дії', () => {
      // 4149 4390 1234 5678 — валідний номер картки за алгоритмом Луна
      const result = SensitiveAssetDetector.evaluateOutboundPayload({
        text: 'Ось номер моєї картки для оплати товару: 4149 4390 1234 5678. Чекаю на кошти!',
      });

      expect(result.shouldBlock).toBe(false);
      expect(result.action).toBe('ALLOW');
      expect(result.detectedAssets.hasCard).toBe(true);
      expect(result.detectedAssets.cards).toContain('4149439012345678');
      expect(result.detectedAssets.hasCvv).toBe(false);
      expect(result.detectedAssets.hasExpiry).toBe(false);
    });

    it('дозволяє номер картки без пробілів (16 цифр Luhn-valid)', () => {
      const result = SensitiveAssetDetector.evaluateOutboundPayload({
        text: 'Скиньте на 4149439012345678',
      });

      expect(result.shouldBlock).toBe(false);
      expect(result.action).toBe('ALLOW');
      expect(result.detectedAssets.hasCard).toBe(true);
    });

    it('не реагує хибно на довільні не-банківські послідовності цифр (не проходять Луна)', () => {
      const result = SensitiveAssetDetector.evaluateOutboundPayload({
        text: 'Номер накладної або замовлення: 1234 5678 9012 3456',
      });

      expect(result.shouldBlock).toBe(false);
      expect(result.detectedAssets.hasCard).toBe(false);
    });
  });

  // ── 3. Номер картки + CVV/CVC (Критичний витік) ────────────────────────────
  describe('Номер картки + Секретний код CVV/CVC', () => {
    it('блокує передачу номера картки разом із кодом CVV', () => {
      const result = SensitiveAssetDetector.evaluateOutboundPayload({
        text: '4149 4390 1234 5678, код CVV 452',
      });

      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('BLOCK');
      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.detectedAssets.hasCard).toBe(true);
      expect(result.detectedAssets.hasCvv).toBe(true);
      expect(result.reason).toContain('CVV');
    });

    it('блокує ізольований CVV код з контекстним маркером у повідомленні', () => {
      const result = SensitiveAssetDetector.evaluateOutboundPayload({
        text: 'ось мій cvc2: 789',
      });

      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('BLOCK');
      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.detectedAssets.hasCvv).toBe(true);
    });

    it('блокує українські варіанти назв CVV ("код безпеки", "код ззаду", "свв")', () => {
      const variants = [
        'три цифри ззаду картки: 382',
        'код безпеки: 123',
        'мій свв 491',
        'код картки 662',
      ];

      for (const text of variants) {
        const result = SensitiveAssetDetector.evaluateOutboundPayload({ text });
        expect(result.shouldBlock).toBe(true);
        expect(result.detectedAssets.hasCvv).toBe(true);
      }
    });
  });

  // ── 4. Номер картки + Термін дії (MM/YY) ──────────────────────────────────
  describe('Термін дії картки (Expiration Date)', () => {
    it('блокує передачу номера картки разом із терміном дії картки (MM/YY)', () => {
      const result = SensitiveAssetDetector.evaluateOutboundPayload({
        text: 'Картка 4149 4390 1234 5678 діє до 08/28',
      });

      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('BLOCK');
      expect(result.riskLevel).toBe('HIGH');
      expect(result.detectedAssets.hasExpiry).toBe(true);
      expect(result.detectedAssets.expiry).toBe('08/28');
    });

    it('блокує повний платіжний набір (PAN + EXP + CVV)', () => {
      const result = SensitiveAssetDetector.evaluateOutboundPayload({
        text: '4149 4390 1234 5678, exp 11/27, cvv 884',
      });

      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('BLOCK');
      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.detectedAssets.hasCard).toBe(true);
      expect(result.detectedAssets.hasExpiry).toBe(true);
      expect(result.detectedAssets.hasCvv).toBe(true);
    });

    it('не блокує звичайні дати у форматі DD/MM або роки у тексті', () => {
      const result = SensitiveAssetDetector.evaluateOutboundPayload({
        text: 'Зустрінемося 25/12/2026 або надішліть до 15.08',
      });

      expect(result.shouldBlock).toBe(false);
      expect(result.detectedAssets.hasExpiry).toBe(false);
    });
  });

  // ── 5. Одноразові SMS коди (OTP) ──────────────────────────────────────────
  describe('Одноразові банківські SMS-паролі (OTP Token)', () => {
    it('блокує передачу SMS-коду підтвердження', () => {
      const result = SensitiveAssetDetector.evaluateOutboundPayload({
        text: 'Ось код з смс 8492 для зарахування коштів',
      });

      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('BLOCK');
      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.detectedAssets.hasOtp).toBe(true);
      expect(result.reason).toContain('SMS');
    });

    it('блокує передачу 6-значного одноразового пароля підтвердження', () => {
      const result = SensitiveAssetDetector.evaluateOutboundPayload({
        text: 'Пароль підтвердження від банку: 492019',
      });

      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('BLOCK');
      expect(result.detectedAssets.hasOtp).toBe(true);
    });
  });

  // ── 6. Private Vault: Розблокований та заблокований стан ──────────────────
  describe('Private Vault Data Leakage (Locked vs Unlocked)', () => {
    const mockUnlockedVaultItems: VaultItem[] = [
      {
        id: 'vault-1',
        category: 'MOTHER_MAIDEN_NAME',
        label: 'Дівоче прізвище матері',
        realValue: 'Людмила',
        decoyValue: 'Оксана',
        keywords: ['дівоче', 'прізвище матері', 'maiden'],
        createdAt: Date.now(),
      },
      {
        id: 'vault-2',
        category: 'SECRET_WORD',
        label: 'Секретне слово банку',
        realValue: 'Калина',
        decoyValue: 'Дніпро',
        keywords: ['кодове слово', 'секретне слово', 'codeword'],
        createdAt: Date.now(),
      },
      {
        id: 'vault-3',
        category: 'TAX_ID',
        label: 'РНОКПП (ІПН)',
        realValue: '3124567890',
        decoyValue: '2987654321',
        keywords: ['рнокпп', 'іпн', 'tax id'],
        createdAt: Date.now(),
      },
    ];

    it('блокує передачу дівочого прізвища матері, якщо Vault розблокований', () => {
      const result = SensitiveAssetDetector.evaluateOutboundPayload({
        text: 'Моє дівоче прізвище матері: Людмила',
        unlockedVaultItems: mockUnlockedVaultItems,
      });

      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('BLOCK');
      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.detectedAssets.vaultMatches.length).toBeGreaterThan(0);
      expect(result.detectedAssets.vaultMatches[0].label).toBe('Дівоче прізвище матері');
    });

    it('блокує передачу секретного слова банку, якщо Vault розблокований', () => {
      const result = SensitiveAssetDetector.evaluateOutboundPayload({
        text: 'Секретне слово банку Калина',
        unlockedVaultItems: mockUnlockedVaultItems,
      });

      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('BLOCK');
      expect(result.detectedAssets.vaultMatches[0].label).toBe('Секретне слово банку');
    });

    it('не блокує текст за Vault-правилами, якщо Vault ЗАБЛОКОВАНИЙ (unlockedVaultItems порожній)', () => {
      // Коли сховище заблоковане майстер-паролем, розшифрованих значень у пам'яті немає
      const result = SensitiveAssetDetector.evaluateOutboundPayload({
        text: 'Людмила поїхала до Києва',
        unlockedVaultItems: [], // Сховище заблоковане
      });

      expect(result.shouldBlock).toBe(false);
      expect(result.action).toBe('ALLOW');
      expect(result.detectedAssets.vaultMatches.length).toBe(0);
    });
  });

  // ── 7. Національний спротив: витік геолокації та диверсії ───────────────
  describe('Національний спротив: захист від коригування та диверсій (Civic Defense)', () => {
    it('детектує та блокує точні GPS-координати в повідомленні', () => {
      const gpsText = 'Ось точне місце: 50.4501, 30.5234 біля мосту';
      const gpsRes = SensitiveAssetDetector.detectGpsCoordinates(gpsText);
      expect(gpsRes.detected).toBe(true);
      expect(gpsRes.match).toBe('50.4501, 30.5234');

      const result = SensitiveAssetDetector.evaluateOutboundPayload({ text: gpsText });
      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('BLOCK');
      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.detectedAssets.hasGps).toBe(true);
      expect(result.reason).toContain('GPS');
    });

    it('детектує та блокує посилання на карти Google Maps', () => {
      const mapsText = 'Скинув точку https://maps.app.goo.gl/AbCdEf123';
      const gpsRes = SensitiveAssetDetector.detectGpsCoordinates(mapsText);
      expect(gpsRes.detected).toBe(true);

      const result = SensitiveAssetDetector.evaluateOutboundPayload({ text: mapsText });
      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('BLOCK');
      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.detectedAssets.hasGps).toBe(true);
    });

    it('детектує та блокує маркери диверсійного рекрутингу та підпалів', () => {
      const texts = [
        'Плачу в гривнях за підпал релейних шаф',
        'Треба знати де стоїть ппо',
        'Потрібні координати ппо або склад',
      ];

      for (const t of texts) {
        const sabRes = SensitiveAssetDetector.detectSabotageRecruitment(t);
        expect(sabRes.detected).toBe(true);

        const result = SensitiveAssetDetector.evaluateOutboundPayload({ text: t });
        expect(result.shouldBlock).toBe(true);
        expect(result.action).toBe('BLOCK');
        expect(result.riskLevel).toBe('CRITICAL');
        expect(result.detectedAssets.hasSabotage).toBe(true);
        expect(result.reason).toMatch(/диверсій|Сили оборони/i);
      }
    });
  });

  // ── 8. Криптовалютні Seed-фрази та паролі ───────────────────────────────
  describe('Криптовалютні Seed-фрази та паролі', () => {
    it('детектує та блокує Seed-фразу з 12 слів без контекстних маркерів', () => {
      const seedText = 'apple banana cherry dog elephant frog giraffe house igloo jump kite lemon';
      const result = SensitiveAssetDetector.evaluateOutboundPayload({ text: seedText });
      
      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('BLOCK');
      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.detectedAssets.hasSeedPhrase).toBe(true);
      expect(result.reason).toContain('Seed-фраз');
    });

    it('детектує Seed-фразу з контекстним маркером', () => {
      const seedText = 'моя сід фраза: apple banana cherry dog elephant frog giraffe house igloo jump kite lemon';
      const result = SensitiveAssetDetector.evaluateOutboundPayload({ text: seedText });
      
      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('BLOCK');
      expect(result.detectedAssets.hasSeedPhrase).toBe(true);
    });

    it('детектує та блокує паролі з контекстом', () => {
      const pwdText = 'Ось мій пароль: SuperSecretP@ss123!';
      const result = SensitiveAssetDetector.evaluateOutboundPayload({ text: pwdText });
      
      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('BLOCK');
      expect(result.riskLevel).toBe('HIGH');
      expect(result.detectedAssets.hasPassword).toBe(true);
      expect(result.detectedAssets.passwordMatch).toBe('SuperSecretP@ss123!');
    });

    it('не блокує короткі або небезпечні набори слів, які не є паролем чи seed-фразою', () => {
      const normalText = 'я просто написав три слова англійською: one two three';
      const result = SensitiveAssetDetector.evaluateOutboundPayload({ text: normalText });
      
      expect(result.shouldBlock).toBe(false);
      expect(result.detectedAssets.hasSeedPhrase).toBe(false);
      expect(result.detectedAssets.hasPassword).toBe(false);
    });
  });
});
