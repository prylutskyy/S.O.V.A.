import { describe, expect, it } from 'vitest';
import { getThreatMitigationAction } from '../../../src/heuristics/threat-mitigation-policy';

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
});
