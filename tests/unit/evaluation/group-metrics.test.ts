import { describe, expect, it } from 'vitest';
import { summarizeGroup } from '../../evaluation/group-metrics';

const entry = (assessment: string, expectedDetected: boolean, actualDetected: boolean, actualAction = 'ALLOW') => ({
  assessment, expectedDetected, actualDetected, expectedType: null, actualType: null,
  expectedAction: 'ALLOW', actualAction, exactMatch: expectedDetected === actualDetected && actualAction === 'ALLOW',
});
describe('Separate corpus metrics', () => {
  it('excludes ambiguous cases from binary metrics and counts their locks separately', () => {
    const g = summarizeGroup([entry('threat', true, true), entry('safe', false, false), entry('ambiguous', false, true, 'LOCK_INPUT')]);
    expect(g.totalCases).toBe(3);
    expect(g.scoredCases).toBe(2);
    expect(g.overall).toMatchObject({ tp: 1, tn: 1, fp: 0, fn: 0, f1: 1 });
    expect(g.falseLockInputs).toBe(0);
    expect(g.ambiguous).toEqual({ n: 1, detected: 1, locked: 1 });
  });
  it('records exploratory misses rather than dropping them', () => {
    const g = summarizeGroup([entry('threat', true, false), entry('safe', false, true, 'LOCK_INPUT')]);
    expect(g.overall).toMatchObject({ fn: 1, fp: 1, f1: 0 });
    expect(g.exactMatches).toBe(0);
    expect(g.falseLockInputs).toBe(1);
  });
  it('does not invent a measured exact-match score for an ambiguity-only set', () => {
    expect(summarizeGroup([entry('ambiguous', false, false)]).exactMatchRate).toBeNull();
  });
  it('keeps historical cases without assessment in the regression score', () => {
    const { assessment, ...historical } = entry('safe', false, false);
    expect(summarizeGroup([historical]).overall.tn).toBe(1);
  });
});
