import { describe, it, expect, beforeEach } from 'vitest';
import { FastLanguageDetector } from '../../../src/heuristics/language-detector';

describe('FastLanguageDetector', () => {
  beforeEach(() => {
    FastLanguageDetector.clearCache();
  });

  describe('Ukrainian Language Detection', () => {
    it('detects pure Ukrainian text with unique Cyrillic characters (і, ї, є, ґ)', () => {
      const text = 'Будь ласка, підтвердіть отримання коштів за оголошенням на сайті';
      const result = FastLanguageDetector.detect(text);

      expect(result.primary).toBe('uk');
      expect(result.languages).toContain('uk');
      expect(result.script).toBe('cyrillic');
      expect(result.isMixed).toBe(false);
      expect(result.confidence).toBeGreaterThanOrEqual(75);
    });

    it('detects Ukrainian text with apostrophe as strong linguistic marker', () => {
      const text = 'Отримайте свої зв’язки та п’ять гривень виплати';
      const result = FastLanguageDetector.detect(text);

      expect(result.primary).toBe('uk');
      expect(result.languages).toContain('uk');
    });

    it('detects Ukrainian text using exclusive stop-words even without unique letters', () => {
      const text = 'це для вас або для мами';
      const result = FastLanguageDetector.detect(text);

      expect(result.primary).toBe('uk');
      expect(result.languages).toContain('uk');
    });

    it('correctly reports isUkrainian helper', () => {
      expect(FastLanguageDetector.isUkrainian('Перейдіть за посиланням для отримання виплати')).toBe(true);
      expect(FastLanguageDetector.isUkrainian('Hello world please send money')).toBe(false);
    });
  });

  describe('Russian Language Detection', () => {
    it('detects pure Russian text with unique Cyrillic characters (ы, э, ъ, ё)', () => {
      const text = 'Пожалуйста, перейдите по этой ссылке чтобы подтвердить получение денег';
      const result = FastLanguageDetector.detect(text);

      expect(result.primary).toBe('ru');
      expect(result.languages).toContain('ru');
      expect(result.script).toBe('cyrillic');
      expect(result.confidence).toBeGreaterThanOrEqual(75);
    });

    it('detects Russian text using exclusive stop-words when unique letters are absent', () => {
      const text = 'это заказ или безопасная сделка';
      const result = FastLanguageDetector.detect(text);

      expect(result.primary).toBe('ru');
      expect(result.languages).toContain('ru');
    });

    it('correctly reports isRussian helper', () => {
      expect(FastLanguageDetector.isRussian('Перейдите по ссылке для получения средств')).toBe(true);
      expect(FastLanguageDetector.isRussian('Доброго дня, підтвердіть замовлення')).toBe(false);
    });
  });

  describe('English Language Detection', () => {
    it('detects pure English text with Latin script', () => {
      const text = 'Please verify your card and follow the link to receive funds immediately';
      const result = FastLanguageDetector.detect(text);

      expect(result.primary).toBe('en');
      expect(result.languages).toContain('en');
      expect(result.script).toBe('latin');
      expect(result.isMixed).toBe(false);
      expect(result.confidence).toBeGreaterThanOrEqual(70);
    });

    it('correctly reports isEnglish helper', () => {
      expect(FastLanguageDetector.isEnglish('Your account verification code is required')).toBe(true);
      expect(FastLanguageDetector.isEnglish('Оплата за товар здійснена успішно')).toBe(false);
    });
  });

  describe('Mixed Script and Multilingual Contexts', () => {
    it('detects mixed Ukrainian/Russian (Surzhyk) markers and flags isMixed', () => {
      const text = 'Я вже зробив заказ, перейдіть по ссылке і підтвердіть';
      const result = FastLanguageDetector.detect(text);

      expect(result.isMixed).toBe(true);
      expect(result.languages).toContain('uk');
      expect(result.languages).toContain('ru');
    });

    it('handles Cyrillic chat containing English keywords or brand names', () => {
      const text = 'Оформив OLX доставку, гроші вже на рахунку, перейдіть у Viber';
      const result = FastLanguageDetector.detect(text);

      expect(result.script).toBe('mixed');
      expect(result.languages).toContain('uk');
    });

    it('ignores URLs during script counting to avoid biasing Cyrillic messages', () => {
      const text = 'Ось посилання https://olx.ua-pay-security.com/receive для отримання коштів';
      const result = FastLanguageDetector.detect(text);

      expect(result.primary).toBe('uk');
      expect(result.script).toBe('cyrillic');
    });
  });

  describe('Edge Cases and Fallbacks', () => {
    it('returns safe fallback for empty string', () => {
      const result = FastLanguageDetector.detect('');
      expect(result.primary).toBe('uk');
      expect(result.script).toBe('none');
      expect(result.languages).toEqual(['uk', 'ru', 'en']);
    });

    it('returns safe fallback for short strings under 3 characters', () => {
      const result = FastLanguageDetector.detect('ok');
      expect(result.primary).toBe('uk');
      expect(result.script).toBe('none');
    });

    it('returns safe fallback for string containing only URLs', () => {
      const result = FastLanguageDetector.detect('https://secure-pay.example.com');
      expect(result.primary).toBe('uk');
    });
  });

  describe('Cache & Performance', () => {
    it('caches repeated detections and returns identical object references', () => {
      const text = 'Перейдіть за посиланням для отримання виплати';
      const first = FastLanguageDetector.detect(text);
      const second = FastLanguageDetector.detect(text);

      expect(first).toBe(second);
    });

    it('evicts old entries when cache exceeds MAX_CACHE_SIZE', () => {
      for (let i = 0; i < 260; i++) {
        FastLanguageDetector.detect(`Унікальне повідомлення номер ${i} для перевірки кешу`);
      }
      // Should not throw or crash and continue functioning normally
      const res = FastLanguageDetector.detect('Тестове контрольне повідомлення');
      expect(res.primary).toBe('uk');
    });

    it('executes 1,000 detections in under 50ms (< 0.05ms per message)', () => {
      const messages = [
        'Я вже оформив доставку, перейдіть за цим посиланням щоб отримати гроші на картку',
        'Я уже оформил доставку, перейдите по этой ссылке чтобы получить деньги на карту',
        'Your order has been paid. Click here to confirm payment and receive funds immediately',
        'Будь ласка, введіть свій пароль або 12 слів для відновлення доступу',
        'Напишите мне в вайбер или телеграм для уточнения адреса отправки товара'
      ];

      FastLanguageDetector.clearCache();
      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        FastLanguageDetector.detect(messages[i % messages.length]);
      }

      const elapsedMs = performance.now() - startTime;
      expect(elapsedMs).toBeLessThan(50);
    });
  });
});
