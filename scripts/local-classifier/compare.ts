import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ChatSessionState } from '../../src/heuristics/chat-session-state';
import { SUPPORTED_FEATURE_DIMENSIONS } from '../../src/heuristics/linear-features';
import { digest, prepareDataset, readCorpus, type TrainingDataset } from './dataset';
import { comparisonMetrics } from './comparison-metrics';

type Row = { id: string; expected: string; candidate: string; decision: string; score: number; margin: number; status: string };
type Measurement = { dimensions: number; parameters: number; datasetHash: string; modelHash: string; modelBytes: number; decodedWeightsBytes: number;
  parts: Array<{ split: string; rows: Row[] }>;
  resource: { cpu: string; node: string; coldMs: number; typical: { n: number; medianMs: number; p95Ms: number; maxMs: number }; long: { n: number; medianMs: number; p95Ms: number; maxMs: number }; timeouts: number; processPeakRssBytes: number; scope: string } };
const source = readFileSync('training/local-intent/dataset.json', 'utf8');
const dataset = JSON.parse(source) as TrainingDataset;
if (JSON.stringify(dataset) !== JSON.stringify(prepareDataset())) throw new Error('Dataset stale or modified');
const trainCount = dataset.records.filter(record => record.split === 'train').length;
const validationCount = dataset.records.filter(record => record.split === 'validation').length;
const runtimePath = 'src/heuristics/models/local-intent-v1.json';
const runtimeHash = digest(readFileSync(runtimePath, 'utf8'));
const worker = resolve('.cache/local-classifier/size-worker.mjs');
function run(phase: string, dimensions: number) {
  const result = spawnSync(process.execPath, [worker, phase, String(dimensions)], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
  return result.stdout;
}
const rules = new Map<string, string>();
for (const entry of [...readCorpus('development'), ...readCorpus('regressions'), ...readCorpus('holdout')]) {
  ChatSessionState.reset();
  let result: ReturnType<typeof ChatSessionState.addMessageAndEvaluate> | undefined;
  for (const message of entry.messages) result = ChatSessionState.addMessageAndEvaluate(message.text, message.speaker === 'user' ? 'outbound' : 'inbound');
  rules.set(entry.id, result?.hasFormedIntent ? result.intentType! : 'SAFE');
}
const variants = SUPPORTED_FEATURE_DIMENSIONS.map(dimensions => {
  console.log(`Training and measuring ${dimensions} features…`);
  run('train', dimensions);
  const measurement = JSON.parse(run('measure', dimensions)) as Measurement;
  if (measurement.datasetHash !== digest(source)) throw new Error('Dataset mismatch');
  return { ...measurement, parts: measurement.parts.map(part => ({ ...part,
    rules: comparisonMetrics(part.rows.map(row => ({ expected: row.expected, actual: rules.get(row.id)! }))),
    candidate: comparisonMetrics(part.rows.map(row => ({ expected: row.expected, actual: row.candidate }))),
    accepted: comparisonMetrics(part.rows.map(row => ({ expected: row.expected, actual: row.decision }))),
    fixes: part.rows.filter(row => rules.get(row.id) !== row.expected && row.candidate === row.expected).map(row => row.id),
    regressions: part.rows.filter(row => rules.get(row.id) === row.expected && row.candidate !== row.expected).map(row => row.id),
  })) };
});
if (digest(readFileSync(runtimePath, 'utf8')) !== runtimeHash) throw new Error('Experiment changed deployed model');
const report = { schemaVersion: 1, datasetHash: digest(source), runtimeArtifactUnchanged: true,
  controls: { seed: 20261010, epochs: 220, minScore: .6, minMargin: .15, trainExamples: trainCount, validationExamples: validationCount,
    changedVariable: 'feature hash dimensions only', holdout: 'historical comparison, not used for selection', mitigation: 'shadow-only' }, variants };
writeFileSync('tests/results/linear-classifier-sizes.json', JSON.stringify(report, null, 2) + '\n');
const summary = variants.map(variant => ({ features: variant.dimensions, parameters: variant.parameters,
  validation: variant.parts.find(part => part.split === 'validation')!.candidate.correct,
  holdout: variant.parts.find(part => part.split === 'holdout')!.candidate.correct,
  maxMs: Math.max(variant.resource.coldMs, variant.resource.typical.maxMs, variant.resource.long.maxMs),
  peakMiB: variant.resource.processPeakRssBytes / 1048576 }));
console.table(summary);
const baseValidation = variants[0].parts.find(part => part.split === 'validation')!;
const rulesHoldout = variants[0].parts.find(part => part.split === 'holdout')!.rules;
writeFileSync('training/local-intent/SIZE_COMPARISON.md', '# Порівняння кількості параметрів\n\n' +
  `Однакові ${trainCount} навчальний і ${validationCount} відкладених прикладів, групи, seed, 220 епох, пороги та алгоритм. Змінюється лише розмір простору хешованих ознак. Runtime залишається на початковій моделі 8192; експеримент не перезаписує її.\n\n` +
  '| Ознак | Параметрів | Ваги Float32 | Validation: точний тип | Holdout: точний тип | Максимум, мс | Пік процесу, MiB |\n|---:|---:|---:|---:|---:|---:|---:|\n' +
  variants.map((variant, i) => `| ${variant.dimensions} | ${variant.parameters} | ${variant.decodedWeightsBytes / 1024} KiB | ${summary[i].validation}/${validationCount} | ${summary[i].holdout}/${variant.parts.find(part => part.split === 'holdout')!.candidate.n} | ${summary[i].maxMs.toFixed(2)} | ${summary[i].peakMiB.toFixed(1)} |`).join('\n') +
  `\n\nПравила: ${baseValidation.rules.correct}/${baseValidation.rules.n} на validation, ${rulesHoldout.correct}/${rulesHoldout.n} на історичному holdout. Для оцінки збільшення параметрів використовуйте validation; holdout уже використовувався при розвитку правил і не є незалежною перевіркою.\n\n` +
  'Validation, порядок 8192/16384/32768: пропуски загроз ' + variants.map(variant => variant.parts.find(part => part.split === 'validation')!.candidate.fn).join('/') +
  ', хибні спрацювання ' + variants.map(variant => variant.parts.find(part => part.split === 'validation')!.candidate.fp).join('/') +
  ', покриття впевнених прогнозів ' + variants.map(variant => (variant.parts.find(part => part.split === 'validation')!.accepted.coverage * 100).toFixed(1) + '%').join('/') +
  '. Однакова кількість правильних відповідей не означає тотожні прогнози; дивіться macro-F1 і сценарії. Автоматичної заміни моделі немає.\n\n' +
  `CPU: ${variants[0].resource.cpu}; ${variants[0].resource.node}. По 300 звичайних і 300 довгих прогнозів на варіант, плюс холодний прогноз. Час включає підготовку входу; максимум не є гарантованою верхньою межею. Кожен варіант виміряний окремим CPU-only процесом Node без навчання в цьому процесі. RSS включає середовище Node і набори даних, не весь браузер чи розширення.\n\n` +
  '[JSON: сценарії, FP/FN, macro-F1, покриття, регресії, p95](../../tests/results/linear-classifier-sizes.json). Відтворення: `npm run classifier:compare`. Кандидат без порога і прийнятий прогноз наведено окремо; відмови не можна ігнорувати при оцінці повноти.\n');
