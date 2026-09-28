// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { SessionOutboundMemory } from '../../../src/heuristics/session-outbound-memory';
import { PersonalVaultManager } from '../../../src/core/personal-vault';

describe('SessionOutboundMemory (TDD Suite)', () => {
  beforeEach(async () => {
    SessionOutboundMemory.reset();
  });

  describe('Single-message evaluations', () => {
    it('allows benign conversation text without blocking', () => {
      const evaluation = SessionOutboundMemory.evaluateWithHistory('Доброго дня! Чи актуальний велосипед?');
      expect(evaluation.shouldBlock).toBe(false);
      expect(evaluation.riskLevel).toBe('SAFE');
      expect(evaluation.score).toBe(0);
      expect(evaluation.leakage.hasCard).toBe(false);
      expect(evaluation.leakage.hasCvv).toBe(false);
    });

    it('allows P2P credit card number alone (PAN without CVV/expiry)', () => {
      const evaluation = SessionOutboundMemory.evaluateWithHistory('Моя картка для оплати: 4149 4390 1234 5678');
      expect(evaluation.shouldBlock).toBe(false);
      expect(evaluation.riskLevel).toBe('SAFE');
      expect(evaluation.leakage.hasCard).toBe(true);
      expect(evaluation.leakage.hasCvv).toBe(false);
      expect(evaluation.leakage.cards).toContain('4149439012345678');
    });

    it('blocks combined card number and CVV in the same message with CRITICAL risk level', () => {
      const evaluation = SessionOutboundMemory.evaluateWithHistory('4149 4390 1234 5678, 123');
      expect(evaluation.shouldBlock).toBe(true);
      expect(evaluation.riskLevel).toBe('CRITICAL');
      expect(evaluation.score).toBeGreaterThanOrEqual(80);
      expect(evaluation.leakage.hasCard).toBe(true);
      expect(evaluation.leakage.hasCvv).toBe(true);
      expect(evaluation.reason).toContain('CVV');
    });

    it('blocks card number + explicit CVV keyword in the same message', () => {
      const evaluation = SessionOutboundMemory.evaluateWithHistory('Ось 4149 4390 1234 5678 і cvv 456');
      expect(evaluation.shouldBlock).toBe(true);
      expect(evaluation.riskLevel).toBe('CRITICAL');
      expect(evaluation.leakage.hasCard).toBe(true);
      expect(evaluation.leakage.hasCvv).toBe(true);
    });
  });

  describe('Cross-message cumulative session memory', () => {
    it('blocks sequential credential harvesting: Card in Message 1, then CVV in Message 2', () => {
      // Message 1: User sends card number for P2P transfer
      const msg1 = 'Моя картка: 4149 4390 1234 5678';
      const eval1 = SessionOutboundMemory.evaluateWithHistory(msg1);
      expect(eval1.shouldBlock).toBe(false);

      // System records that card number was sent
      SessionOutboundMemory.recordSentMessage(msg1);
      expect(SessionOutboundMemory.hasSentCard()).toBe(true);
      expect(SessionOutboundMemory.getSentCards()).toContain('4149439012345678');

      // Message 2: Interlocutor asked for CVV and victim sends just the 3 digits
      const msg2 = '123';
      const eval2 = SessionOutboundMemory.evaluateWithHistory(msg2);

      expect(eval2.shouldBlock).toBe(true);
      expect(eval2.riskLevel).toBe('CRITICAL');
      expect(eval2.score).toBeGreaterThanOrEqual(85);
      expect(eval2.leakage.hasCard).toBe(true);
      expect(eval2.leakage.hasCvv).toBe(true);
      expect(eval2.leakage.isCrossMessage).toBe(true);
      expect(eval2.reason).toContain('роздільну передачу');
    });

    it('blocks sequential credential harvesting when CVV is prefixed with code word in Message 2', () => {
      SessionOutboundMemory.recordSentMessage('4149 4390 1234 5678');

      const eval2 = SessionOutboundMemory.evaluateWithHistory('код 789');
      expect(eval2.shouldBlock).toBe(true);
      expect(eval2.riskLevel).toBe('CRITICAL');
      expect(eval2.leakage.isCrossMessage).toBe(true);
    });

    it('blocks reverse order: CVV in Message 1, then Card in Message 2', () => {
      // User sent CVV in Message 1
      SessionOutboundMemory.recordSentMessage('cvv 999');
      expect(SessionOutboundMemory.hasSentCvv()).toBe(true);

      // User sends Card in Message 2
      const eval2 = SessionOutboundMemory.evaluateWithHistory('4149 4390 1234 5678');
      expect(eval2.shouldBlock).toBe(true);
      expect(eval2.riskLevel).toBe('CRITICAL');
      expect(eval2.leakage.isCrossMessage).toBe(true);
    });

    it('blocks Card in Message 1 and Expiration Date in Message 2', () => {
      SessionOutboundMemory.recordSentMessage('4149 4390 1234 5678');

      const eval2 = SessionOutboundMemory.evaluateWithHistory('термін дії 08/28');
      expect(eval2.shouldBlock).toBe(true);
      expect(eval2.riskLevel).toBe('HIGH');
      expect(eval2.leakage.isCrossMessage).toBe(true);
      expect(eval2.reason).toContain('термін дії');
    });

    it('does not falsely flag harmless numbers like prices after sending a card', () => {
      SessionOutboundMemory.recordSentMessage('4149 4390 1234 5678');

      const evalPrice = SessionOutboundMemory.evaluateWithHistory('Ціна 500 грн за доставку');
      expect(evalPrice.shouldBlock).toBe(false);
      expect(evalPrice.leakage.hasCvv).toBe(false);
    });

    it('clears memory when reset() is invoked', () => {
      SessionOutboundMemory.recordSentMessage('4149 4390 1234 5678');
      expect(SessionOutboundMemory.hasSentCard()).toBe(true);

      SessionOutboundMemory.reset();
      expect(SessionOutboundMemory.hasSentCard()).toBe(false);
      expect(SessionOutboundMemory.getSentMessagesCount()).toBe(0);

      // Now "123" without card context is not recognized as cross-message card+cvv
      const evalAfterReset = SessionOutboundMemory.evaluateWithHistory('123');
      expect(evalAfterReset.leakage.isCrossMessage).toBe(false);
    });
  });
});
