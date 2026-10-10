import { describe, expect, it } from 'vitest';
import { getThreatMitigationAction, getLocalFallbackAction } from '../../../src/heuristics/threat-mitigation-policy';

describe('getThreatMitigationAction', () => {
  it('allows messages when no threat intent was detected', () => {
    expect(getThreatMitigationAction(false, null)).toBe('ALLOW');
  });

  it('warns without locking input for ordinary social-engineering intents', () => {
    expect(getThreatMitigationAction(true, 'OFF_PLATFORM_REDIRECT')).toBe('WARN');
  });

  it('locks input only for critical intent categories', () => {
    expect(getThreatMitigationAction(true, 'MILITARY_SABOTAGE_RECRUITMENT')).toBe('LOCK_INPUT');
    expect(getThreatMitigationAction(true, 'SEED_PHRASE_THEFT')).toBe('LOCK_INPUT');
    expect(getThreatMitigationAction(true, 'CRYPTO_WALLET_COMPROMISE')).toBe('LOCK_INPUT');
  });

  it('warns for a formed identity request at score 45 without lowering critical lock thresholds', () => {
    expect(getLocalFallbackAction('IDENTITY_PROBING', 45)).toBe('WARN');
    for (const type of ['MILITARY_SABOTAGE_RECRUITMENT', 'CRYPTO_WALLET_COMPROMISE', 'SEED_PHRASE_THEFT']) {
      expect(getLocalFallbackAction(type, 74)).toBe('ALLOW');
      expect(getLocalFallbackAction(type, 75)).toBe('LOCK_INPUT');
    }
  });

  it('keeps weak unknown signals and missing or invalid scores out of fallback warnings', () => {
    expect(getLocalFallbackAction('UNKNOWN', 45)).toBe('ALLOW');
    expect(getLocalFallbackAction('UNKNOWN', 85)).toBe('WARN');
    for (const score of [undefined, 0, -1, NaN, Infinity]) {
      expect(getLocalFallbackAction('IDENTITY_PROBING', score)).toBe('ALLOW');
    }
  });
});
