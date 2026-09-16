import { describe, it, expect } from 'vitest';
import { TextNormalizer } from '../../../src/heuristics/text-normalizer';

describe('TextNormalizer', () => {
  describe('normalizeForMatching (Continuous String)', () => {
    it('should remove spaces and punctuation', () => {
      expect(TextNormalizer.normalizeForMatching('о п л а т а')).toBe('оплата');
      expect(TextNormalizer.normalizeForMatching('д.о-с_т*а,в!к?а')).toBe('доставка');
    });

    it('should replace latin letters with cyrillic homoglyphs', () => {
      // o, p, a are latin here
      expect(TextNormalizer.normalizeForMatching('oплaтa')).toBe('оплата');
      expect(TextNormalizer.normalizeForMatching('viber')).toBe('vіbеr'); // v, b, r stay latin, i->і, e->е
    });

    it('should replace numbers with cyrillic homoglyphs', () => {
      expect(TextNormalizer.normalizeForMatching('0плата')).toBe('оплата');
      expect(TextNormalizer.normalizeForMatching('0лx')).toBe('олх'); // 0->о, x(latin)->х(cyrillic)
      expect(TextNormalizer.normalizeForMatching('v1bеr')).toBe('vіbеr'); 
    });

    it('should handle complex mixed obfuscation', () => {
      const obfuscated = '0 п л a т a';
      expect(TextNormalizer.normalizeForMatching(obfuscated)).toBe('оплата');
    });
  });

  describe('normalizeWords (Preserving Words)', () => {
    it('should normalize characters but preserve spaces between words', () => {
      const text = 'Мій v1ber для 0плати';
      expect(TextNormalizer.normalizeWords(text)).toBe('мій vіbеr для оплати');
    });

    it('should remove punctuation from words', () => {
      const text = 'Привіт! Скинь на кaрту, будь-ласка.';
      // a(latin)->а(cyrillic)
      expect(TextNormalizer.normalizeWords(text)).toBe('привіт скинь на карту будьласка');
    });

    it('should join single space-separated characters into one word', () => {
      const text = 'Для отримання о п л а т и та д о с т а в к и перейдіть сюди';
      expect(TextNormalizer.normalizeWords(text)).toBe('для отримання оплати та доставки перейдіть сюди');
    });
  });
});
