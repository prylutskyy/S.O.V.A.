import { describe, it, expect } from 'vitest';
import { UrlExtractor } from '../../../src/heuristics/url-extractor';

describe('UrlExtractor', () => {
  it('should extract normal URLs', () => {
    const urls = UrlExtractor.extract('Перейдіть за посиланням https://olx.ua/payment');
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe('https://olx.ua/payment'); // actually the regex currently only captures the domain part.
  });

  it('should extract obfuscated dots', () => {
    const urls = UrlExtractor.extract('olx-pay (крапка) com (крапка) ua');
    expect(urls).toContain('https://olx-pay.com.ua');

    const urls2 = UrlExtractor.extract('Моє посилання: secure [.] payment [.] com');
    expect(urls2).toContain('https://secure.payment.com');
  });

  it('should extract spaced URLs', () => {
    const urls = UrlExtractor.extract('Ось лінк: olx-dostavka . com . ua');
    expect(urls).toContain('https://olx-dostavka.com.ua');
  });

  it('should ignore regular spaced words', () => {
    const urls = UrlExtractor.extract('Це просто звичайний текст без посилань');
    expect(urls).toHaveLength(0);
  });
});
