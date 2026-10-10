import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { LocalPrediction } from '../../src/heuristics/linear-classifier';
import { digest } from './dataset';
import { readPilot, preparePilotDataset } from './pilot-data';
import { pilotMetrics, type PilotStep } from './pilot-metrics';
import { comparisonMetrics } from './comparison-metrics';

type ExistingRow = { id: string; expected: string; baseline: LocalPrediction; candidate: LocalPrediction };
type Measured = { datasetHash: string; baselineHash: string; candidateHash: string; corpusHash: string; parameters: number; trainingExamples: number;
  existing: Array<{ split: string; rows: ExistingRow[] }>; steps: PilotStep[];
  resource: { cpu: string; node: string; timings: Record<string, { coldMs: number; medianMs: number; p95Ms: number; maxMs: number; timeouts: number }>;
    processPeakRssBytes: number; decodedWeightsPerModelBytes: number; scope: string } };
const path = 'src/heuristics/models/local-intent-v1.json', originalHash = digest(readFileSync(path, 'utf8'));
const corpus = readPilot(), dataset = preparePilotDataset(corpus);
const worker = resolve('.cache/local-classifier/pilot-worker.mjs');
function run(phase: string): string {
  const result = spawnSync(process.execPath, [worker, phase], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
  return result.stdout;
}
run('train'); const measured = JSON.parse(run('measure')) as Measured;
if (digest(readFileSync(path, 'utf8')) !== originalHash) throw new Error('Pilot changed runtime artifact');
const existing = measured.existing.map(part => ({ ...part,
  baselineMetrics: comparisonMetrics(part.rows.map(row => ({ expected: row.expected, actual: row.baseline.candidate ?? 'ABSTAIN' }))),
  candidateMetrics: comparisonMetrics(part.rows.map(row => ({ expected: row.expected, actual: row.candidate.candidate ?? 'ABSTAIN' }))),
  fixes: part.rows.filter(row => row.baseline.candidate !== row.expected && row.candidate.candidate === row.expected).map(row => row.id),
  regressions: part.rows.filter(row => row.baseline.candidate === row.expected && row.candidate.candidate !== row.expected).map(row => row.id) }));
const originalValidationIds = new Set(dataset.records.filter(record => record.split === 'validation').map(record => record.id));
const originalValidation = measured.existing.flatMap(part => part.rows).filter(row => originalValidationIds.has(row.id));
const validationOld = { baseline: comparisonMetrics(originalValidation.map(row => ({ expected: row.expected, actual: row.baseline.candidate! }))),
  candidate: comparisonMetrics(originalValidation.map(row => ({ expected: row.expected, actual: row.candidate.candidate! }))) };
const parts = ['train', 'validation', 'test'].map(split => {
  const terminal = measured.steps.filter(row => row.split === split && row.terminal);
  const seen = new Set<string>();
  const prefixes = measured.steps.filter(row => row.split === split && !row.terminal && !seen.has(row.family) && Boolean(seen.add(row.family)));
  return { split, baseline: pilotMetrics(terminal, 'baseline'), candidate: pilotMetrics(terminal, 'candidate'),
    benignPrefixes: { baseline: pilotMetrics(prefixes, 'baseline'), candidate: pilotMetrics(prefixes, 'candidate') } };
});
const report = { schemaVersion: 1, ...measured, existing, originalValidation: validationOld, parts, runtimeArtifactUnchanged: true,
  controls: { featureDimensions: 8192, parameters: measured.parameters, seed: 20261010, epochs: 220, minScore: .6, minMargin: .15,
    newTrainingRecords: dataset.records.filter(record => record.source === 'social-engineering-pilot').length,
    pilotValidationAndTestUsedForTraining: false, ambiguousUsedAsSafeTargets: false },
  caveats: ['Synthetic author-reviewed labels; independent human review pending.', 'Only six dangerous terminal examples in each pilot validation/test partition.',
    'Ambiguity is evaluated separately, never folded into SAFE accuracy.', 'Historical holdout is not independent validation.',
    'Hypothetical locks use type mapping only; no actual lock can be applied by this model.', 'No features or thresholds tuned after looking at pilot test results.'] };
writeFileSync('tests/results/social-engineering-pilot.json', JSON.stringify(report, null, 2) + '\n');
console.table(parts.map(part => ({ split: part.split, known: part.baseline.candidate.n,
  baselineCorrect: part.baseline.candidate.correct, candidateCorrect: part.candidate.candidate.correct,
  baselineFP: part.baseline.candidate.fp, candidateFP: part.candidate.candidate.fp,
  baselineFN: part.baseline.candidate.fn, candidateFN: part.candidate.candidate.fn,
  ambiguous: part.baseline.ambiguity.n, oldAbstain: part.baseline.ambiguity.abstained, newAbstain: part.candidate.ambiguity.abstained })));
console.table(existing.map(part => ({ split: part.split, baseline: part.baselineMetrics.correct, candidate: part.candidateMetrics.correct,
  n: part.baselineMetrics.n, fixes: part.fixes.length, regressions: part.regressions.length })));
console.log(JSON.stringify({ originalValidation: validationOld, resource: measured.resource }, null, 2));
writeFileSync('training/local-intent/PILOT_REPORT.md', '# Пілот: соціальна інженерія під прикриттям авторитету\n\n' +
  '90 сценаріїв, 30 контрастних сімейств: керівник, офіційна установа, ЗМІ. 54 train / 18 validation / 18 test. Кожна частина містить однакову кількість небезпечних, безпечних і неоднозначних завершень. Очікування наведені після кожної вхідної репліки.\n\n' +
  `До початкових 171 навчального прикладу додано ${report.controls.newTrainingRecords} відомих покрокових міток із train. Спільні нешкідливі початки сімейства враховано один раз. Неоднозначні завершення виключені з навчання; їх не оголошено безпечними. Старе розділення та модель із ${measured.parameters} параметрами збережені. Кандидат має ті самі ознаки, seed, епохи і пороги.\n\n` +
  '| Частина | Відомих міток | Точний тип: сирий стара → нова | Правильних прийнятих стара → нова | FP: стара → нова | FN: стара → нова | Неоднозначних | ABSTAIN: стара → нова |\n|---|---:|---:|---:|---:|---:|---:|---:|\n' +
  parts.map(part => `| ${part.split} | ${part.baseline.candidate.n} | ${part.baseline.candidate.correct} → ${part.candidate.candidate.correct} | ${part.baseline.accepted.correct} → ${part.candidate.accepted.correct} | ${part.baseline.candidate.fp} → ${part.candidate.candidate.fp} | ${part.baseline.candidate.fn} → ${part.candidate.candidate.fn} | ${part.baseline.ambiguity.n} | ${part.baseline.ambiguity.abstained} → ${part.candidate.ambiguity.abstained} |`).join('\n') +
  '\n\nТочність тут стосується сирого кандидата на відомих кінцевих мітках; ABSTAIN для неоднозначних наведено окремо. Повні прийняті прогнози, покриття, macro-F1, початкові репліки і діагностичні потенційні блокування є у JSON.\n\n' +
  '| Попередній корпус | N | Точний тип: стара → нова | Виправлень | Регресій |\n|---|---:|---:|---:|---:|\n' +
  existing.map(part => `| ${part.split} | ${part.baselineMetrics.n} | ${part.baselineMetrics.correct} → ${part.candidateMetrics.correct} | ${part.fixes.length} | ${part.regressions.length} |`).join('\n') +
  `\n\nСтарі відкладені 40 прикладів: ${validationOld.baseline.correct} → ${validationOld.candidate.correct} правильних типів. Новий test містить лише 6 небезпечних прикладів: цього недостатньо для оцінки реальної ефективності. Синтетичні мітки потребують незалежної людської перевірки; самопроголошений статус не доводить підробку особи.\n\n` +
  `CPU: ${measured.resource.cpu}; пік процесу з двома моделями ${(measured.resource.processPeakRssBytes / 1048576).toFixed(1)} MiB. Ваги кожної моделі — 256 KiB. Навчання виконано в іншому процесі. Це не вимір усього розширення.\n\n` +
  Object.entries(measured.resource.timings).map(([name, timing]) => `- ${name}: холодний ${timing.coldMs.toFixed(2)} мс, p95 ${timing.p95Ms.toFixed(2)} мс, максимум прогрітих ${timing.maxMs.toFixed(2)} мс, таймаутів ${timing.timeouts}.`).join('\n') +
  '\n\nХолодні виміри в одному процесі мають різний стан JIT; їх не слід трактувати як точне порівняння моделей. У двох сімействах пауза 180 секунд: попереднє знайомство відсутнє у 60-секундному вікні, як і в runtime. Тривале встановлення довіри не реалізовано цим навчанням.\n\n' +
  'Runtime залишився на початковій моделі. Кандидат і набір навчання — у `.cache/local-classifier/social-pilot-*`; до захисту не підключені. Жодних банерів чи блокувань від кандидата немає. Відтворення: `npm run classifier:pilot`.\n\n' +
  '[Корпус](social-engineering-pilot.json) · [Повний звіт зі сценаріями](../../tests/results/social-engineering-pilot.json).\n');
