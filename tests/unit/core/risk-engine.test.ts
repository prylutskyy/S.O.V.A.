import { describe, it, expect } from 'vitest';
import { RiskEngine } from '../../../src/core/risk-engine';
import { HeuristicResult } from '../../../src/types';

describe('RiskEngine', () => {
  it('should evaluate low risk for no triggers', () => {
    const result = RiskEngine.evaluate([]);
    expect(result.score).toBe(0);
    expect(result.level).toBe('LOW');
  });

  it('should sum scores of active triggers correctly', () => {
    const triggers: HeuristicResult[] = [
      { id: '1', name: 'T1', type: 'CONTENT', triggered: true, scoreContribution: 20, confidence: 100, severity: 'HIGH', message: 'Triggered' },
      { id: '2', name: 'T2', type: 'DOMAIN', triggered: true, scoreContribution: 10, confidence: 100, severity: 'HIGH', message: 'Triggered' },
      { id: '3', name: 'T3', type: 'FORM', triggered: false, scoreContribution: 50, confidence: 100, severity: 'HIGH', message: 'Triggered' },
    ];
    
    // Default context is submit, but isEntirelyEmpty = false and hasFilledSensitive = false
    // So the score = 30, but then limited to Math.min(score, 45) -> 30.
    const result = RiskEngine.evaluate(triggers);
    expect(result.score).toBe(30);
    expect(result.level).toBe('MEDIUM'); // 21-50 is MEDIUM
  });

  it('should apply context bonus', () => {
    const triggers: HeuristicResult[] = [
      { id: '1', name: 'T1', type: 'CONTENT', triggered: true, scoreContribution: 20, confidence: 100, severity: 'HIGH', message: 'Triggered' }
    ];
    
    // Score = 20 + 30 (bonus) = 50. Math.min(50, 45) = 45.
    const result = RiskEngine.evaluate(triggers, undefined, 30);
    expect(result.score).toBe(45);
    expect(result.level).toBe('MEDIUM');
  });

  describe('User Context Handling', () => {
    it('should add 35 points if submitting sensitive data', () => {
      const triggers: HeuristicResult[] = [
        { id: '1', name: 'T1', type: 'DOMAIN', triggered: true, scoreContribution: 30, confidence: 100, severity: 'HIGH', message: 'Triggered' }
      ];
      
      const result = RiskEngine.evaluate(triggers, {
        action: 'submit',
        hasFilledSensitive: true,
        isEntirelyEmpty: false
      });
      
      // 30 + 35 = 65 -> HIGH
      expect(result.score).toBe(65);
      expect(result.level).toBe('HIGH');
    });

    it('should cap score at 30 if submitting an entirely empty form', () => {
      const triggers: HeuristicResult[] = [
        { id: '1', name: 'T1', type: 'DOMAIN', triggered: true, scoreContribution: 80, confidence: 100, severity: 'HIGH', message: 'Triggered' }
      ];
      
      const result = RiskEngine.evaluate(triggers, {
        action: 'submit',
        hasFilledSensitive: false,
        isEntirelyEmpty: true
      });
      
      // Initially 80, but capped at 30 because empty form is not dangerous
      expect(result.score).toBe(30);
      expect(result.level).toBe('MEDIUM');
    });

    it('should cap score at 45 if submitting non-sensitive data (to prevent false positive)', () => {
      const triggers: HeuristicResult[] = [
        { id: '1', name: 'T1', type: 'DOMAIN', triggered: true, scoreContribution: 90, confidence: 100, severity: 'HIGH', message: 'Triggered' }
      ];
      
      const result = RiskEngine.evaluate(triggers, {
        action: 'submit',
        hasFilledSensitive: false,
        isEntirelyEmpty: false
      });
      
      // Initially 90, but capped at 45 because no sensitive data was filled
      expect(result.score).toBe(45);
      expect(result.level).toBe('MEDIUM');
    });

    it('should add 20 points if pasting sensitive data', () => {
      const triggers: HeuristicResult[] = [
        { id: '1', name: 'T1', type: 'DOMAIN', triggered: true, scoreContribution: 50, confidence: 100, severity: 'HIGH', message: 'Triggered' }
      ];
      
      const result = RiskEngine.evaluate(triggers, {
        action: 'paste',
        hasFilledSensitive: true,
        isEntirelyEmpty: false
      });
      
      // 50 + 20 = 70 -> HIGH
      expect(result.score).toBe(70);
      expect(result.level).toBe('HIGH');
    });
  });

  it('should cap final score between 0 and 100', () => {
    const triggers: HeuristicResult[] = [
      { id: '1', name: 'T1', type: 'DOMAIN', triggered: true, scoreContribution: 200, confidence: 100, severity: 'HIGH', message: 'Triggered' }
    ];
    
    const result = RiskEngine.evaluate(triggers, {
        action: 'submit',
        hasFilledSensitive: true,
        isEntirelyEmpty: false
    }); // 200 + 35 = 235 => capped to 100
    
    expect(result.score).toBe(100);
    expect(result.level).toBe('CRITICAL');
  });
});
