import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextManager } from '../../../src/core/context-manager';
import { InMemoryStorageAdapter } from '../../../src/core/adapters/storage.adapter';
import { PersonalVaultManager } from '../../../src/core/personal-vault';
import { ActiveThreatContext } from '../../../src/types';

describe('Adversarial Suite: Time Travel, Concurrency & State Tampering', () => {
  let storage: InMemoryStorageAdapter;
  let manager: ContextManager;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
    manager = new ContextManager(storage);
    vi.restoreAllMocks();
  });

  describe('System Clock Skew & Time Travel Anomalies (ContextManager)', () => {
    it('invalidates context when system clock moves forward beyond TTL (TTL Expiry)', async () => {
      const tabId = 101;
      const initialTime = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(initialTime);

      await manager.setTaintedContext(
        tabId,
        {
          sourcePlatform: 'olx.ua',
          scenario: 'ESCROW_DELIVERY_FRAUD',
          threatLevel: 'HIGH',
          detectedKeywords: ['доставка', 'оплата'],
          offPlatformLure: true,
        },
        5000 // 5 seconds TTL
      );

      // Fast-forward time by 10 seconds
      vi.spyOn(Date, 'now').mockReturnValue(initialTime + 10000);

      const active = await manager.getActiveTaintedContext(tabId);
      expect(active).toBeNull();

      // Ensure storage was cleaned up
      const rawStored = await storage.get(`tainted_context_${tabId}`);
      expect(rawStored).toBeNull();
    });

    it('clears context and prevents immortal zombie state when clock jumps backward by > 1 minute', async () => {
      const tabId = 202;
      const initialTime = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(initialTime);

      await manager.setTaintedContext(
        tabId,
        {
          sourcePlatform: 'prom.ua',
          scenario: 'VERIFICATION_PHISHING',
          threatLevel: 'HIGH',
          detectedKeywords: ['перевірка'],
          offPlatformLure: false,
        },
        15 * 60 * 1000
      );

      // Time travel backward by 10 minutes (clock skew / user changed PC time)
      vi.spyOn(Date, 'now').mockReturnValue(initialTime - 600000);

      const active = await manager.getActiveTaintedContext(tabId);
      expect(active).toBeNull();

      // Ensure storage was purged to prevent perpetual tainted state
      const rawStored = await storage.get(`tainted_context_${tabId}`);
      expect(rawStored).toBeNull();
    });

    it('tolerates small clock jitter within 10 seconds (e.g. NTP synchronization)', async () => {
      const tabId = 303;
      const initialTime = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(initialTime);

      await manager.setTaintedContext(
        tabId,
        {
          sourcePlatform: 'olx.ua',
          scenario: 'ESCROW_DELIVERY_FRAUD',
          threatLevel: 'MEDIUM',
          detectedKeywords: ['оплата'],
          offPlatformLure: false,
        },
        60000
      );

      // Small 5 second backward step (acceptable clock jitter)
      vi.spyOn(Date, 'now').mockReturnValue(initialTime - 5000);

      const active = await manager.getActiveTaintedContext(tabId);
      expect(active).not.toBeNull();
      expect(active?.sourcePlatform).toBe('olx.ua');
    });
  });

  describe('Tab Lineage Concurrency & Race Conditions', () => {
    it('propagates context concurrently across 10 child tabs in parallel without race conditions', async () => {
      const parentTabId = 100;
      await manager.setTaintedContext(parentTabId, {
        sourcePlatform: 'telegram',
        scenario: 'ESCROW_DELIVERY_FRAUD',
        threatLevel: 'HIGH',
        detectedKeywords: ['купити', 'посилання'],
        offPlatformLure: true,
      });

      // Spawn 10 tabs simultaneously
      const childTabIds = Array.from({ length: 10 }, (_, i) => 200 + i);
      const propagationResults = await Promise.all(
        childTabIds.map((childId) => manager.propagateContext(parentTabId, childId))
      );

      // Every propagation succeeds
      expect(propagationResults.every((res) => res === true)).toBe(true);

      // Verify each child tab has its own valid active context
      const childContexts = await Promise.all(
        childTabIds.map((childId) => manager.getActiveTaintedContext(childId))
      );

      childContexts.forEach((ctx) => {
        expect(ctx).not.toBeNull();
        expect(ctx?.sourcePlatform).toBe('telegram');
        expect(ctx?.threatLevel).toBe('HIGH');
      });
    });

    it('rejects self-propagation loop (sourceTabId === targetTabId)', async () => {
      const tabId = 555;
      await manager.setTaintedContext(tabId, {
        sourcePlatform: 'olx.ua',
        scenario: 'ESCROW_DELIVERY_FRAUD',
        threatLevel: 'LOW',
        detectedKeywords: [],
        offPlatformLure: false,
      });

      const result = await manager.propagateContext(tabId, tabId);
      expect(result).toBe(false);
    });

    it('returns false gracefully when propagating from a non-existent tab', async () => {
      const nonExistentTabId = 99999;
      const targetTabId = 777;

      const result = await manager.propagateContext(nonExistentTabId, targetTabId);
      expect(result).toBe(false);

      const targetCtx = await manager.getActiveTaintedContext(targetTabId);
      expect(targetCtx).toBeNull();
    });
  });

  describe('Storage State Corruption & Tampering Resilience', () => {
    it('safely handles corrupted non-JSON or malformed data in storage for a tab', async () => {
      const tabId = 888;
      // Inject corrupted string instead of ActiveThreatContext object
      await storage.set(`tainted_context_${tabId}`, 'MALFORMED_NON_OBJECT' as any);

      const active = await manager.getActiveTaintedContext(tabId);
      // Fails safely without throwing
      expect(active).toBeDefined();
    });

    it('fails safely when vault storage contains tampered / corrupted ciphertext', async () => {
      PersonalVaultManager['isInitialized'] = false;
      PersonalVaultManager['masterKey'] = null;

      // Tamper storage with invalid payload
      const mockStorage: Record<string, any> = {
        personal_vault_ciphertext: 'NOT_VALID_BASE64_CIPHERTEXT!!??',
        personal_vault_salt: 'dGVzdHNhbHQ=',
        personal_vault_iv: 'dGVzdGl2',
      };

      vi.stubGlobal('chrome', {
        storage: {
          local: {
            get: vi.fn(async (keys?: any) => {
              if (typeof keys === 'string') return { [keys]: mockStorage[keys] };
              return { ...mockStorage };
            }),
            set: vi.fn(async () => {}),
          },
          session: {
            get: vi.fn(async () => ({})),
            set: vi.fn(async () => {}),
          },
        },
      });

      const unlockResult = await PersonalVaultManager.unlock('Password123');
      expect(unlockResult).toBe(false);
      expect(PersonalVaultManager.isLocked()).toBe(true);
    });
  });
});
