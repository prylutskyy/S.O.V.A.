import type { LocalPrediction } from '../../src/heuristics/linear-classifier';
import { getThreatMitigationAction } from '../../src/heuristics/threat-mitigation-policy';
import { comparisonMetrics } from './comparison-metrics';
import type { PilotExpectation } from './pilot-data';

export type PilotStep = { id: string; caseId: string; family: string; split: string; topic: string; terminal: boolean;
  expected: PilotExpectation; baseline: LocalPrediction; candidate: LocalPrediction };
export function pilotMetrics(rows: PilotStep[], name: 'baseline' | 'candidate') {
  const known = rows.filter(row => row.expected.label !== null);
  const ambiguous = rows.filter(row => row.expected.kind === 'ambiguous');
  const ambiguity = { n: ambiguous.length, abstained: ambiguous.filter(row => row[name].decision === 'ABSTAIN').length,
    confidentSafe: ambiguous.filter(row => row[name].decision === 'SAFE').length,
    confidentThreat: ambiguous.filter(row => !['SAFE', 'ABSTAIN'].includes(row[name].decision)).length };
  return { candidate: comparisonMetrics(known.map(row => ({ expected: row.expected.label!, actual: row[name].candidate ?? 'ABSTAIN' }))),
    accepted: comparisonMetrics(known.map(row => ({ expected: row.expected.label!, actual: row[name].decision }))), ambiguity,
    hypotheticalExcessLocks: rows.filter(row => row.expected.maxAction !== 'LOCK_INPUT' &&
      getThreatMitigationAction(!['SAFE', 'ABSTAIN'].includes(row[name].decision), row[name].decision) === 'LOCK_INPUT').map(row => row.id),
    // Type-to-action mapping is diagnostic only; scores are not fallback confidence.
    actionsApplied: rows.filter(row => row[name].actionApplied !== false).length };
}
