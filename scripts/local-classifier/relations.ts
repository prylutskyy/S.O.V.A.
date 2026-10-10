import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { LocalPrediction } from '../../src/heuristics/linear-classifier';
import { digest } from './dataset';
import { comparisonMetrics } from './comparison-metrics';
import type { PilotExpectation } from './pilot-data';
import { getThreatMitigationAction } from '../../src/heuristics/threat-mitigation-policy';
const variants = ['baseline', 'pilot', 'relations', 'guarded'] as const;
type Variant = typeof variants[number];
type Predictions = Record<Variant, LocalPrediction>;
type Step = Predictions & { id: string; expected: PilotExpectation; split: string; terminal: boolean; family: string };
type Existing = Predictions & { id: string; expected: string };
type Measured = { datasetHash: string; models: Record<Variant, { hash: string; featureVersion: number; parameters: number }>;
  existing: Array<{ split: string; rows: Existing[] }>; steps: Step[]; diagnostic: Step[];
  resource: { cpu: string; timings: Record<Variant, { n: number; medianMs: number; p95Ms: number; maxMs: number; timeouts: number }>; processPeakRssBytes: number; scope: string } };
const path = 'src/heuristics/models/local-intent-v1.json', hash = digest(readFileSync(path, 'utf8'));
const worker = resolve('.cache/local-classifier/relations-worker.mjs');
function run(phase: string) {
  const result = spawnSync(process.execPath, [worker, phase], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
  return result.stdout;
}
run('train'); const measured = JSON.parse(run('measure')) as Measured;
if (digest(readFileSync(path, 'utf8')) !== hash) throw new Error('Runtime model changed');
function summarize(rows: Step[], variant: Variant) {
  const known = rows.filter(row => row.expected.label !== null), ambiguous = rows.filter(row => row.expected.kind === 'ambiguous');
  return { raw: comparisonMetrics(known.map(row => ({ expected: row.expected.label!, actual: row[variant].candidate ?? 'ABSTAIN' }))),
    accepted: comparisonMetrics(known.map(row => ({ expected: row.expected.label!, actual: row[variant].decision }))),
    ambiguous: { n: ambiguous.length, abstain: ambiguous.filter(row => row[variant].decision === 'ABSTAIN').length,
      confidentSafe: ambiguous.filter(row => row[variant].decision === 'SAFE').length },
    falseSafe: rows.filter(row => row.expected.kind === 'threat' && row[variant].decision === 'SAFE').map(row => row.id),
    excessiveLocks: rows.filter(row => row.expected.maxAction !== 'LOCK_INPUT' && getThreatMitigationAction(!['SAFE', 'ABSTAIN'].includes(row[variant].decision), row[variant].decision) === 'LOCK_INPUT').map(row => row.id),
    reasons: Object.fromEntries([...new Set(rows.map(row => row[variant].abstentionReason).filter(Boolean))].map(reason => [reason, rows.filter(row => row[variant].abstentionReason === reason).length])) };
}
const groups = ['train', 'validation', 'test'].map(split => ({ split, metrics: Object.fromEntries(variants.map(variant => [variant, summarize(measured.steps.filter(row => row.split === split && row.terminal), variant)])) }));
const prefixes = Object.fromEntries(variants.map(variant => [variant, summarize(measured.steps.filter(row => !row.terminal).filter((row, index, rows) => rows.findIndex(other => other.family === row.family) === index), variant)]));
const diagnostic = Object.fromEntries(variants.map(variant => [variant, summarize(measured.diagnostic, variant)]));
const existing = measured.existing.map(part => ({ split: part.split, metrics: Object.fromEntries(variants.map(variant => [variant, {
  raw: comparisonMetrics(part.rows.map(row => ({ expected: row.expected, actual: row[variant].candidate ?? 'ABSTAIN' }))),
  accepted: comparisonMetrics(part.rows.map(row => ({ expected: row.expected, actual: row[variant].decision }))) }])) }));
const report = { schemaVersion: 1, ...measured, groups, prefixes, diagnosticMetrics: diagnostic, existingMetrics: existing, runtimeArtifactUnchanged: true,
  caveats: ['Pilot splits are now historical development checks, not blind validation.', 'Diagnostic cases were authored during feature development, not independent holdout.',
    'Abstention policy is deterministic evidence validation, not a learned ambiguity class or probability calibration.',
    'Higher abstention reduces coverage; inspect accepted exact, false SAFE, and safe refusals together.', 'No variant changes protection actions.'] };
writeFileSync('tests/results/request-relations.json', JSON.stringify(report, null, 2) + '\n');
const table = groups.flatMap(group => variants.map(variant => {
  const metric = group.metrics[variant]; return { split: group.split, variant, raw: metric.raw.correct, accepted: metric.accepted.correct,
    known: metric.raw.n, ambiguousAbstain: `${metric.ambiguous.abstain}/${metric.ambiguous.n}`, falseSAFE: metric.falseSafe.length };
}));
console.table(table); console.log(JSON.stringify({ diagnostic, prefixes, existing, resource: measured.resource }, null, 2));
writeFileSync('training/local-intent/RELATIONS_REPORT.md', '# Ознаки запиту та утримання від висновку\n\n' +
  'Контрольовані варіанти: baseline (171 приклад, ознаки v1); pilot (225, v1); relations (225, v2); guarded (ті самі ваги v2 із перевіркою достатності ознак). Кожна модель має 65 544 параметри. Пороги 0.60/0.15 не знижувалися. Runtime зберігає baseline.\n\n' +
  '| Частина | Варіант | Сирий точний тип | Правильних прийнятих | Неоднозначні: ABSTAIN | Хибний впевнений SAFE на загрозі |\n|---|---|---:|---:|---:|---:|\n' +
  table.map(row => `| ${row.split} | ${row.variant} | ${row.raw}/${row.known} | ${row.accepted}/${row.known} | ${row.ambiguousAbstain} | ${row.falseSAFE} |`).join('\n') +
  '\n\n## Старі приклади\n\n| Частина | Варіант | Сирий точний тип | Правильних прийнятих | Покриття |\n|---|---|---:|---:|---:|\n' +
  existing.flatMap(part => variants.map(variant => { const metric = part.metrics[variant]; return `| ${part.split} | ${variant} | ${metric.raw.correct}/${metric.raw.n} | ${metric.accepted.correct}/${metric.accepted.n} | ${(metric.accepted.coverage * 100).toFixed(1)}% |`; })).join('\n') +
  '\n\n## Обмеження\n\n' + report.caveats.map(text => `- ${text}`).join('\n') +
  `\n\nCPU: ${measured.resource.cpu}; пік процесу з чотирма моделями ${(measured.resource.processPeakRssBytes / 1048576).toFixed(1)} MiB. Навчання виконується окремо. Це не пам'ять усього розширення.\n\n` +
  variants.map(variant => { const timing = measured.resource.timings[variant]; return `- ${variant}: p95 ${timing.p95Ms.toFixed(2)} мс, максимум ${timing.maxMs.toFixed(2)} мс, таймаутів ${timing.timeouts}.`; }).join('\n') +
  '\n\n[Повний JSON: усі прогнози, відмови й діагностика](../../tests/results/request-relations.json). Відтворення: `npm run classifier:relations`.\n');
