import { describe, it, expect } from 'vitest';
import { FuzzyMatcher } from '../../../src/heuristics/fuzzy-matcher';

describe('FuzzyMatcher', () => {
  describe('Damerau-Levenshtein distance & isFuzzyMatch', () => {
    it('should return 0 for identical strings', () => {
      expect(FuzzyMatcher.levenshtein('Смирнова', 'Смирнова')).toBe(0);
      expect(FuzzyMatcher.isFuzzyMatch('Смирнова', 'Смирнова')).toBe(true);
    });

    it('should recognize 1-character typo (insertion, deletion, substitution, transposition)', () => {
      // Зайва літера на кінці (insertion)
      expect(FuzzyMatcher.levenshtein('смирноваа', 'смирнова')).toBe(1);
      expect(FuzzyMatcher.isFuzzyMatch('смирноваа', 'смирнова')).toBe(true);

      // Пропущена літера (deletion)
      expect(FuzzyMatcher.levenshtein('смирнва', 'смирнова')).toBe(1);
      expect(FuzzyMatcher.isFuzzyMatch('смирнва', 'смирнова')).toBe(true);

      // Заміна літери (substitution: 'і' замість 'и')
      expect(FuzzyMatcher.levenshtein('смірнова', 'смирнова')).toBe(1);
      expect(FuzzyMatcher.isFuzzyMatch('смірнова', 'смирнова')).toBe(true);

      // Перестановка двох сусідніх літер (transposition)
      expect(FuzzyMatcher.levenshtein('смринова', 'смирнова')).toBe(1);
      expect(FuzzyMatcher.isFuzzyMatch('смринова', 'смирнова')).toBe(true);
    });

    it('should allow up to 2 typos for long secrets (>= 8 chars)', () => {
      expect(FuzzyMatcher.isFuzzyMatch('смирновааб', 'смирнова')).toBe(true); // length 8, dist 2
      expect(FuzzyMatcher.isFuzzyMatch('смирно', 'смирнова')).toBe(true); // 2 missing chars
      expect(FuzzyMatcher.isFuzzyMatch('петренко', 'смирнова')).toBe(false);
    });

    it('should strictly require exact match for short words (< 5 chars)', () => {
      expect(FuzzyMatcher.isFuzzyMatch('дім', 'дім')).toBe(true);
      expect(FuzzyMatcher.isFuzzyMatch('дам', 'дім')).toBe(false);
    });
  });

  describe('canonicalFold (Homoglyphs + Phonetic folding)', () => {
    it('should unify Cyrillic and Latin lookalike homoglyphs', () => {
      // Латинська 'C' замість кириличної 'С'
      const latinC = 'Cмирнова';
      const cyrillicС = 'Смирнова';
      expect(FuzzyMatcher.canonicalFold(latinC)).toBe(FuzzyMatcher.canonicalFold(cyrillicС));
    });

    it('should unify vowel variations (и, і, ї, ы)', () => {
      expect(FuzzyMatcher.canonicalFold('Смірнова')).toBe(FuzzyMatcher.canonicalFold('Смирнова'));
      expect(FuzzyMatcher.canonicalFold('Смырнова')).toBe(FuzzyMatcher.canonicalFold('Смирнова'));
    });

    it('should fold duplicate adjacent letters', () => {
      expect(FuzzyMatcher.canonicalFold('Смирноваа')).toBe(FuzzyMatcher.canonicalFold('Смирнова'));
    });
  });

  describe('transliteration (KMU-2010 + popular)', () => {
    it('should transliterate Cyrillic to Latin', () => {
      const variants = FuzzyMatcher.transliterateCyrillic('Смирнова');
      expect(variants).toContain('smyrnova');
      expect(variants).toContain('smirnova');
    });

    it('should match transliterated names', () => {
      expect(FuzzyMatcher.isTranslitMatch('Smirnova', 'Смирнова')).toBe(true);
      expect(FuzzyMatcher.isTranslitMatch('smyrnova', 'Смирнова')).toBe(true);
      expect(FuzzyMatcher.isTranslitMatch('Shevchenko', 'Шевченко')).toBe(true);
      expect(FuzzyMatcher.isTranslitMatch('Ivanenko', 'Смирнова')).toBe(false);
    });
  });

  describe('Tax ID (ІПН) typo detection', () => {
    it('should detect 1-digit typo in 10-digit Tax ID', () => {
      expect(FuzzyMatcher.isTypoTaxId('3152607413', '3152607412')).toBe(true); // replace last digit 2 -> 3
      expect(FuzzyMatcher.isTypoTaxId('3152607412', '3152607412')).toBe(true); // exact
      expect(FuzzyMatcher.isTypoTaxId('9992607412', '3152607412')).toBe(false); // 2+ digits diff
    });
  });
});
