import { describe, it, expect } from 'vitest';
import { TextNormalizer } from '../../../src/heuristics/text-normalizer';
import { FuzzyMatcher } from '../../../src/heuristics/fuzzy-matcher';
import { IntentClassifier } from '../../../src/heuristics/intent-classifier';
import { UrlExtractor } from '../../../src/heuristics/url-extractor';

describe('Adversarial Suite: Linguistic Obfuscation & Evasion Resistance', () => {
  describe('Zero-Width & Formatting Character Infiltration', () => {
    it('strips zero-width spaces (U+200B, U+200C, U+200D, U+FEFF, U+2060) from keywords', () => {
      const poisonedText = 'о\u200Bп\u200Cл\u200Dа\uFEFFт\u200Bа через термінал';
      const normalized = TextNormalizer.normalizeForMatching(poisonedText);

      expect(normalized).toContain('оплата');
    });

    it('enables IntentClassifier to detect password theft despite zero-width character evasion', () => {
      const cloakedPasswordMessage = 'Терміново введіть ваш п\u200Bа\u200Cр\u200Dо\uFEFFл\u2060ь для розблокування';
      const extracted = IntentClassifier.extractClusters(cloakedPasswordMessage);

      expect(extracted.detectedClusterMap.has('password_theft')).toBe(true);
      expect(extracted.matchedSpans.length).toBeGreaterThan(0);
    });

    it('enables IntentClassifier to detect delivery intent cloaked with invisible word joiners', () => {
      const cloakedDeliveryMessage = 'Оформити безкоштовну д\u2060о\u200Bс\u200Cт\u200Dа\uFEFFв\u200Bк\u2060у кур єром';
      const extracted = IntentClassifier.extractClusters(cloakedDeliveryMessage);

      expect(extracted.detectedClusterMap.has('delivery_action')).toBe(true);
    });

    it('matches vault marker when candidate or secret contains zero-width characters', () => {
      const secretInVault = 'Іванова';
      const attackerProbed = 'І\u200Bв\u200Cа\u200Dн\uFEFFо\u2060в\u200Bа';

      const match = FuzzyMatcher.isFuzzyMatch(
        FuzzyMatcher.canonicalFold(attackerProbed),
        FuzzyMatcher.canonicalFold(secretInVault)
      );
      expect(match).toBe(true);
    });
  });

  describe('Cross-Script Homoglyph & Mixed Alphabet Attacks', () => {
    it('normalizes Latin homoglyphs mixed into Cyrillic payment words', () => {
      // 'o', 'p', 'a' are Latin characters, 'л', 'т' are Cyrillic
      const mixedAlphabetWord = 'oрлaтa';
      const normalized = TextNormalizer.normalizeForMatching(mixedAlphabetWord);

      expect(normalized).toBe('орлата');
    });

    it('canonicalFold aligns visually identical Latin and Cyrillic text', () => {
      // Latin 'c', 'o', 'a' vs Cyrillic 'с', 'о', 'а'
      const latinText = 'cмирнoвa';
      const cyrillicText = 'смирнова';

      expect(FuzzyMatcher.canonicalFold(latinText)).toBe(FuzzyMatcher.canonicalFold(cyrillicText));
    });

    it('detects banking and escrow keywords with numeral substitutions (leetspeak)', () => {
      // 0 -> о, 1 -> і, 3 -> з
      const leetText = 'перейдіть на 0плату через 1нтернет 3а цим лінком';
      const normalized = TextNormalizer.normalizeForMatching(leetText);

      expect(normalized).toContain('оплату');
      expect(normalized).toContain('інтернет');
      expect(normalized).toContain('за');
    });
  });

  describe('Punctuation, Noise & Delimiter Interleaving', () => {
    it('collapses aggressive delimiter injection between characters', () => {
      const dotDelimited = 'о.п.л.а.т.а';
      const dashDelimited = 'д-о-с-т-а-в-к-а';
      const tildeDelimited = 'б~а~н~к';

      expect(TextNormalizer.normalizeForMatching(dotDelimited)).toContain('оплата');
      expect(TextNormalizer.normalizeForMatching(dashDelimited)).toContain('доставка');
      expect(TextNormalizer.normalizeForMatching(tildeDelimited)).toContain('банк');
    });

    it('reconstructs words written letter-by-letter with whitespace', () => {
      const spacedText = 'термінова о п л а т а замовлення';
      const reconstructed = TextNormalizer.normalizeWords(spacedText);

      expect(reconstructed).toContain('оплата');
    });
  });

  describe('Right-To-Left Override (RTLO) & Directional Spoofing', () => {
    it('safely strips RTLO (U+202E) and LRO (U+202D) characters from normalized text', () => {
      // Attacker tries to reverse extension or domain using RTLO: "doc.\u202Exep.pdf"
      const rtloSpoof = 'Перейдіть за посиланням: \u202Eolx-pay.com/order';
      const normalized = TextNormalizer.normalizeForMatching(rtloSpoof);

      expect(normalized).not.toContain('\u202E');
      expect(normalized).toContain('перейдітьзапосиланням');
    });
  });

  describe('ReDoS & Pathological Input Stress Testing', () => {
    it('processes massive inputs without exponential backtracking (ReDoS safety)', () => {
      const massivePayload = 'а'.repeat(50000) + ' ' + 'о '.repeat(20000) + 'оплата';
      const startTime = performance.now();

      const normalized = TextNormalizer.normalizeForMatching(massivePayload);
      const executionTime = performance.now() - startTime;

      expect(executionTime).toBeLessThan(100);
      expect(normalized).toContain('оплата');
    });

    it('computes Levenshtein and fuzzy match bounded for oversized inputs', () => {
      const longA = 'Смирнова' + 'x'.repeat(500);
      const longB = 'Смірнова' + 'y'.repeat(500);
      const startTime = performance.now();

      const dist = FuzzyMatcher.levenshtein(longA, longB);
      const executionTime = performance.now() - startTime;

      expect(executionTime).toBeLessThan(50);
      expect(dist).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Obfuscated & Evasive URL Extraction', () => {
    it('decodes masked dots like [.] and (крапка)', () => {
      const rawChat = 'Перейдіть на novaposhta[.]ua/track або olx (крапка) ua';
      const extracted = UrlExtractor.extract(rawChat);

      expect(extracted).toContain('https://novaposhta.ua/track');
      expect(extracted).toContain('https://olx.ua');
    });

    it('handles spaced domain names with paths and query params', () => {
      const spacedUrl = 'Ось посилання: secure - pay . ua / checkout?id=99281';
      const extracted = UrlExtractor.extract(spacedUrl);

      expect(extracted.length).toBeGreaterThanOrEqual(1);
      expect(extracted[0]).toBe('https://secure-pay.ua/checkout?id=99281');
    });
  });
});
