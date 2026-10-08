// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { ApprovalRegistry } from '../../../src/core/approval-registry';

describe('ApprovalRegistry (Phase 1: Absolute State Isolation)', () => {
  let element1: HTMLElement;
  let element2: HTMLElement;

  beforeEach(() => {
    element1 = document.createElement('form');
    element2 = document.createElement('div');
    // Clear out the registry conceptually. Since it's a WeakSet and static,
    // we can't easily "clear" it except by just making new elements.
  });

  it('should correctly register and verify an approved element', () => {
    expect(ApprovalRegistry.isApproved(element1)).toBe(false);
    
    ApprovalRegistry.approve(element1);
    
    expect(ApprovalRegistry.isApproved(element1)).toBe(true);
  });

  it('should securely differentiate between different elements', () => {
    ApprovalRegistry.approve(element1);
    
    expect(ApprovalRegistry.isApproved(element1)).toBe(true);
    expect(ApprovalRegistry.isApproved(element2)).toBe(false);
  });

  it('should successfully revoke approval status', () => {
    ApprovalRegistry.approve(element1);
    expect(ApprovalRegistry.isApproved(element1)).toBe(true);
    
    ApprovalRegistry.revoke(element1);
    expect(ApprovalRegistry.isApproved(element1)).toBe(false);
  });

  it('should not leak state into the DOM layer (Absolute Isolation)', () => {
    ApprovalRegistry.approve(element1);
    
    // The element's dataset should be completely pristine.
    // There should be no trace of 'threatShieldApproved' or similar markers.
    expect(Object.keys(element1.dataset).length).toBe(0);
    expect(element1.getAttribute('data-threat-shield-approved')).toBeNull();
  });
});
