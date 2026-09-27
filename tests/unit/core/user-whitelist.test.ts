import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserWhitelistManager } from '../../../src/core/user-whitelist';

describe('UserWhitelistManager', () => {
  beforeEach(async () => {
    // Mock chrome.storage.local
    const storage: Record<string, any> = {};
    (globalThis as any).chrome = {
      storage: {
        local: {
          get: vi.fn(async (key: string) => {
            return { [key]: storage[key] || [] };
          }),
          set: vi.fn(async (items: Record<string, any>) => {
            Object.assign(storage, items);
          }),
          remove: vi.fn(async (key: string) => {
            delete storage[key];
          }),
        },
        onChanged: {
          addListener: vi.fn(),
        },
      },
    };

    await UserWhitelistManager.clearAll();
  });

  describe('normalizeDomain', () => {
    it('should normalize URLs with protocols', () => {
      expect(UserWhitelistManager.normalizeDomain('https://djinni.co/jobs')).toBe('djinni.co');
      expect(UserWhitelistManager.normalizeDomain('http://example.com/test')).toBe('example.com');
    });

    it('should strip www prefix', () => {
      expect(UserWhitelistManager.normalizeDomain('www.djinni.co')).toBe('djinni.co');
      expect(UserWhitelistManager.normalizeDomain('https://www.djinni.co')).toBe('djinni.co');
    });

    it('should strip ports', () => {
      expect(UserWhitelistManager.normalizeDomain('localhost:3000')).toBe('localhost');
      expect(UserWhitelistManager.normalizeDomain('http://127.0.0.1:8080/path')).toBe('127.0.0.1');
    });

    it('should handle whitespace and case sensitivity', () => {
      expect(UserWhitelistManager.normalizeDomain('  DJINNI.CO  ')).toBe('djinni.co');
      expect(UserWhitelistManager.normalizeDomain('')).toBe('');
    });
  });

  describe('isDomainAllowedSync and allowDomain', () => {
    it('should match exact domain after adding', async () => {
      await UserWhitelistManager.allowDomain('djinni.co');
      expect(UserWhitelistManager.isDomainAllowedSync('djinni.co')).toBe(true);
      expect(UserWhitelistManager.isDomainAllowedSync('www.djinni.co')).toBe(true);
      expect(UserWhitelistManager.isDomainAllowedSync('https://djinni.co')).toBe(true);
    });

    it('should match subdomains of whitelisted domain', async () => {
      await UserWhitelistManager.allowDomain('djinni.co');
      expect(UserWhitelistManager.isDomainAllowedSync('app.djinni.co')).toBe(true);
      expect(UserWhitelistManager.isDomainAllowedSync('jobs.djinni.co')).toBe(true);
      expect(UserWhitelistManager.isDomainAllowedSync('notdjinni.co')).toBe(false);
    });

    it('should correctly remove domain', async () => {
      await UserWhitelistManager.allowDomain('djinni.co');
      expect(UserWhitelistManager.isDomainAllowedSync('djinni.co')).toBe(true);

      await UserWhitelistManager.removeDomain('www.djinni.co');
      expect(UserWhitelistManager.isDomainAllowedSync('djinni.co')).toBe(false);
      expect(UserWhitelistManager.isDomainAllowedSync('app.djinni.co')).toBe(false);
    });

    it('should return false for empty or unwhitelisted domain', () => {
      expect(UserWhitelistManager.isDomainAllowedSync('')).toBe(false);
      expect(UserWhitelistManager.isDomainAllowedSync('unknown-site.org')).toBe(false);
    });
  });
});
