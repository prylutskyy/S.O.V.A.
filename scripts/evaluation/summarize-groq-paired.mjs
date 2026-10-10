import { readFileSync, writeFileSync } from 'node:fs';
const path = 'tests/results/groq-prompt-paired.json';
const report = JSON.parse(readFileSync(path, 'utf8'));
report.plannedPairs = 80;
report.completedPairs = report.results.filter(r => r.status === 'completed').length;
report.hadRateLimit = report.results.some(r => r.status === 'rate-limited');
for (const summary of report.summaries) {
  const valid = report.results.filter(r => r.variant === summary.variant && r.status === 'completed');
  const unflagged = valid.filter(r => !r.annotationReview);
  const exact = r => r.actual === r.expected.detected && (!r.actual || r.type === r.expected.intentType);
  summary.unflaggedCases = unflagged.length;
  summary.unflaggedExactMatches = unflagged.filter(exact).length;
  const times = valid.map(r => r.latencyMs).sort((a, b) => a - b);
  summary.completedP95Ms = times[Math.ceil(times.length * .95) - 1];
}
report.note += ' Three annotations were flagged before inference; unflagged metrics are a sensitivity analysis, not independently verified ground truth.';
writeFileSync(path, JSON.stringify(report, null, 2));
console.table(report.summaries);
