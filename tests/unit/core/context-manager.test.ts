import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager, CONTEXT_STORAGE_KEY } from '../../../src/core/context-manager';
import { InMemoryStorageAdapter } from '../../../src/core/adapters/storage.adapter';
import { ActiveThreatContext } from '../../../src/types';

describe('ContextManager', () => {
  let storage: InMemoryStorageAdapter;
  let contextManager: ContextManager;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
    contextManager = new ContextManager(storage);
  });

  it('should set tainted context correctly', async () => {
    const ctx: Omit<ActiveThreatContext, 'timestamp' | 'ttlMs'> = {
      sourcePlatform: 'olx.ua',
      scenario: 'ESCROW_DELIVERY_FRAUD',
      threatLevel: 'HIGH',
      detectedKeywords: ['доставка', 'оплата'],
    };

    const savedCtx = await contextManager.setTaintedContext(ctx, 5000);
    
    expect(savedCtx.sourcePlatform).toBe('olx.ua');
    expect(savedCtx.timestamp).toBeDefined();
    expect(savedCtx.ttlMs).toBe(5000);

    const fromStorage = await storage.get<ActiveThreatContext>(CONTEXT_STORAGE_KEY);
    expect(fromStorage).toBeDefined();
    expect(fromStorage?.sourcePlatform).toBe('olx.ua');
  });

  it('should get active tainted context if within TTL', async () => {
    const ctx: Omit<ActiveThreatContext, 'timestamp' | 'ttlMs'> = {
      sourcePlatform: 'test.com',
      scenario: 'ESCROW_DELIVERY_FRAUD',
      threatLevel: 'MEDIUM',
      detectedKeywords: [],
    };

    await contextManager.setTaintedContext(ctx, 10000); // 10s TTL
    
    const retrieved = await contextManager.getActiveTaintedContext();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.sourcePlatform).toBe('test.com');
  });

  it('should return null and clear storage if TTL has expired', async () => {
    const ctx: Omit<ActiveThreatContext, 'timestamp' | 'ttlMs'> = {
      sourcePlatform: 'expired.com',
      scenario: 'ESCROW_DELIVERY_FRAUD',
      threatLevel: 'HIGH',
      detectedKeywords: [],
    };

    // Set TTL to -1 to force immediate expiration
    await contextManager.setTaintedContext(ctx, -1);
    
    const retrieved = await contextManager.getActiveTaintedContext();
    expect(retrieved).toBeNull();

    // Verify it was cleared from storage
    const fromStorage = await storage.get(CONTEXT_STORAGE_KEY);
    expect(fromStorage).toBeNull();
  });

  it('should clear context explicitly', async () => {
    const ctx: Omit<ActiveThreatContext, 'timestamp' | 'ttlMs'> = {
      sourcePlatform: 'clear.com',
      scenario: 'ESCROW_DELIVERY_FRAUD',
      threatLevel: 'HIGH',
      detectedKeywords: [],
    };

    await contextManager.setTaintedContext(ctx, 5000);
    await contextManager.clearTaintedContext();
    
    const retrieved = await contextManager.getActiveTaintedContext();
    expect(retrieved).toBeNull();
  });
});
