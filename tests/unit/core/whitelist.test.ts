import { describe, it, expect } from 'vitest';
import { isWhitelisted, isMonitoredPlatform } from '../../../src/core/whitelist';

describe('Whitelist', () => {
  describe('isWhitelisted', () => {
    it('should allow known domains', () => {
      expect(isWhitelisted('olx.ua')).toBe(true);
      expect(isWhitelisted('google.com')).toBe(true);
    });

    it('should allow subdomains of known domains', () => {
      expect(isWhitelisted('auth.olx.ua')).toBe(true);
      expect(isWhitelisted('mail.google.com')).toBe(true);
    });

    it('should always allow .gov.ua domains', () => {
      expect(isWhitelisted('diia.gov.ua')).toBe(true);
      expect(isWhitelisted('mvs.gov.ua')).toBe(true);
      expect(isWhitelisted('gov.ua')).toBe(true);
    });

    it('should reject unknown or lookalike domains', () => {
      expect(isWhitelisted('olx-delivery.ua')).toBe(false);
      expect(isWhitelisted('g00gle.com')).toBe(false);
    });
  });

  describe('isMonitoredPlatform', () => {
    it('should monitor specific platforms', () => {
      expect(isMonitoredPlatform('olx.ua')).toBe(true);
      expect(isMonitoredPlatform('prom.ua')).toBe(true);
    });

    it('should monitor subdomains of specific platforms', () => {
      expect(isMonitoredPlatform('m.olx.ua')).toBe(true);
    });

    it('should not monitor regular whitelisted domains if they are not platforms', () => {
      // google.com is whitelisted but not a monitored platform for chat parsing
      expect(isMonitoredPlatform('google.com')).toBe(false);
    });
  });
});
