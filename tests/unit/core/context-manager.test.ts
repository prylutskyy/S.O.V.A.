import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager } from '../../../src/core/context-manager';
import { InMemoryStorageAdapter } from '../../../src/core/adapters/storage.adapter';
import { ActiveThreatContext } from '../../../src/types';

describe('ContextManager', () => {
  let storage: InMemoryStorageAdapter;
  let contextManager: ContextManager;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
    contextManager = new ContextManager(storage);
  });

  it('should set tainted context correctly for a specific tab', async () => {
    const ctx: Omit<ActiveThreatContext, 'timestamp' | 'ttlMs'> = {
      sourcePlatform: 'olx.ua',
      scenario: 'ESCROW_DELIVERY_FRAUD',
      threatLevel: 'HIGH',
      detectedKeywords: ['доставка', 'оплата'],
      offPlatformLure: false,
    };

    const savedCtx = await contextManager.setTaintedContext(101, ctx, 5000);
    
    expect(savedCtx.sourcePlatform).toBe('olx.ua');
    expect(savedCtx.timestamp).toBeDefined();
    expect(savedCtx.ttlMs).toBe(5000);

    const fromStorage = await storage.get<ActiveThreatContext>('tainted_context_101');
    expect(fromStorage).toBeDefined();
    expect(fromStorage?.sourcePlatform).toBe('olx.ua');
    
    // Another tab should not have this context
    const otherTabCtx = await contextManager.getActiveTaintedContext(102);
    expect(otherTabCtx).toBeNull();
  });

  it('should get active tainted context if within TTL', async () => {
    const ctx: Omit<ActiveThreatContext, 'timestamp' | 'ttlMs'> = {
      sourcePlatform: 'test.com',
      scenario: 'ESCROW_DELIVERY_FRAUD',
      threatLevel: 'MEDIUM',
      detectedKeywords: [],
      offPlatformLure: false,
    };

    await contextManager.setTaintedContext(202, ctx, 10000);
    
    const retrieved = await contextManager.getActiveTaintedContext(202);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.sourcePlatform).toBe('test.com');
  });

  it('should return null and clear storage if TTL has expired', async () => {
    const ctx: Omit<ActiveThreatContext, 'timestamp' | 'ttlMs'> = {
      sourcePlatform: 'expired.com',
      scenario: 'ESCROW_DELIVERY_FRAUD',
      threatLevel: 'HIGH',
      detectedKeywords: [],
      offPlatformLure: false,
    };

    await contextManager.setTaintedContext(303, ctx, -1);
    
    const retrieved = await contextManager.getActiveTaintedContext(303);
    expect(retrieved).toBeNull();

    const fromStorage = await storage.get('tainted_context_303');
    expect(fromStorage).toBeNull();
  });

  it('should clear context explicitly for a tab', async () => {
    const ctx: Omit<ActiveThreatContext, 'timestamp' | 'ttlMs'> = {
      sourcePlatform: 'clear.com',
      scenario: 'ESCROW_DELIVERY_FRAUD',
      threatLevel: 'HIGH',
      detectedKeywords: [],
      offPlatformLure: false,
    };

    await contextManager.setTaintedContext(404, ctx, 5000);
    await contextManager.clearTaintedContext(404);
    
    const retrieved = await contextManager.getActiveTaintedContext(404);
    expect(retrieved).toBeNull();
  });

  it('should propagate context from opener tab to new tab', async () => {
    const ctx: Omit<ActiveThreatContext, 'timestamp' | 'ttlMs'> = {
      sourcePlatform: 'opener.com',
      scenario: 'ESCROW_DELIVERY_FRAUD',
      threatLevel: 'HIGH',
      detectedKeywords: [],
      offPlatformLure: true,
    };

    await contextManager.setTaintedContext(505, ctx, 5000);
    
    // Propagate
    const propagated = await contextManager.propagateContext(505, 606);
    expect(propagated).toBe(true);

    const newTabCtx = await contextManager.getActiveTaintedContext(606);
    expect(newTabCtx).not.toBeNull();
    expect(newTabCtx?.sourcePlatform).toBe('opener.com');
  });

  it('should not propagate if opener has no context', async () => {
    const propagated = await contextManager.propagateContext(999, 1000);
    expect(propagated).toBe(false);
    
    const newTabCtx = await contextManager.getActiveTaintedContext(1000);
    expect(newTabCtx).toBeNull();
  });
});
