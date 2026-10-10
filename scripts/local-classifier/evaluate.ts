import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { cpus } from 'node:os';
import { ChatSessionState } from '../../src/heuristics/chat-session-state';
import { LinearIntentClassifier } from '../../src/heuristics/linear-classifier';
import model from '../../src/heuristics/models/local-intent-v1.json';
import { digest, makeInput, prepareDataset, readCorpus, type CorpusCase, type TrainingDataset } from './dataset';

const source = readFileSync('training/local-intent/dataset.json', 'utf8');
const dataset = JSON.parse(source) as TrainingDataset;
if (digest(source) !== model.datasetHash || JSON.stringify(dataset) !== JSON.stringify(prepareDataset())) throw new Error('Stale model/dataset: prepare and train again');
const classifier = new LinearIntentClassifier();
function metrics(rows: Array<{ expected: string; actual: string }>) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const row of rows) {
    if (row.actual === 'ABSTAIN') continue;
    const positive = row.expected !== 'SAFE'; const detected = row.actual !== 'SAFE';
    if (positive && detected) tp++; else if (detected) fp++; else if (positive) fn++; else tn++;
  }
  const precision = tp / (tp + fp || 1), recall = tp / (tp + fn || 1);
  const labels = [...new Set(rows.map(row => row.expected))];
  const perClass = labels.map(label => {
    const correct = rows.filter(row => row.expected === label && row.actual === label).length;
    const p = correct / (rows.filter(row => row.actual === label).length || 1);
    const r = correct / (rows.filter(row => row.expected === label).length || 1);
    return { label, precision: p, recall: r, f1: 2 * p * r / (p + r || 1) };
  });
  return { n: rows.length, coverage: rows.filter(row => row.actual !== 'ABSTAIN').length / (rows.length || 1),
    exact: rows.filter(row => row.expected === row.actual).length / (rows.length || 1), tp, fp, fn, tn, precision, recall,
    f1: 2 * precision * recall / (precision + recall || 1),
    recallIncludingAbstentions: tp / (rows.filter(row => row.expected !== 'SAFE').length || 1),
    macroF1: perClass.reduce((sum, entry) => sum + entry.f1, 0) / labels.length, perClass };
}
const parts = ['train', 'validation', 'holdout'].map(split => {
  const entries: CorpusCase[] = split === 'holdout' ? readCorpus('holdout') : dataset.records.filter(record => record.split === split).map(record => ({ id: record.id,
    messages: record.messages.map(text => ({ speaker: 'interlocutor' as const, text })),
    expected: { detected: record.label !== 'SAFE', intentType: record.label === 'SAFE' ? null : record.label, action: '' } }));
  const rows = entries.map(entry => {
    ChatSessionState.reset();
    let rules: ReturnType<typeof ChatSessionState.addMessageAndEvaluate> | undefined;
    for (const message of entry.messages) rules = ChatSessionState.addMessageAndEvaluate(message.text, message.speaker === 'user' ? 'outbound' : 'inbound');
    const prediction = classifier.predict(makeInput(entry.messages.filter(message => message.speaker === 'interlocutor').map(message => message.text)));
    return { id: entry.id, expected: entry.expected.detected ? entry.expected.intentType! : 'SAFE',
      rules: rules?.hasFormedIntent ? rules.intentType! : 'SAFE', candidate: prediction.candidate ?? 'ABSTAIN', decision: prediction.decision, score: prediction.score, margin: prediction.margin };
  });
  return { split, rules: metrics(rows.map(row => ({ expected: row.expected, actual: row.rules }))),
    linearCandidate: metrics(rows.map(row => ({ expected: row.expected, actual: row.candidate }))),
    linearAccepted: metrics(rows.map(row => ({ expected: row.expected, actual: row.decision }))),
    modelFixes: rows.filter(row => row.rules !== row.expected && row.candidate === row.expected).map(row => row.id),
    modelRegressions: rows.filter(row => row.rules === row.expected && row.candidate !== row.expected).map(row => row.id), rows };
});
const benchModel = new LinearIntentClassifier();
const input = makeInput(['Для отримання виплати надішліть мені CVV та код із SMS.']);
const coldStart = performance.now(); benchModel.predict(input); const coldMs = performance.now() - coldStart;
const samples: number[] = [];
for (let i = 0; i < 200; i++) {
  const start = performance.now();
  benchModel.predict(i % 2 ? input : makeInput(['слово '.repeat(341), 'перевірка '.repeat(227)]));
  samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);
const resource = { cpu: cpus()[0]?.model, node: process.version, coldMs, medianMs: samples[100], p95Ms: samples[190], maxMs: samples.at(-1),
  processPeakRssBytes: process.resourceUsage().maxRSS * 1024, processMemory: process.memoryUsage(), decodedWeightsBytes: 8192 * 8 * 4,
  scope: 'CPU-only Node evaluation process, includes dataset and rules. Not a measurement of the whole browser extension, nor certification on another CPU.' };
const report = { schemaVersion: 1, modelHash: digest(JSON.stringify(model)), datasetHash: model.datasetHash,
  caveats: ['Shadow only: no protection actions changed.', 'Softmax scores are not calibrated probabilities.',
    'Accepted-only precision/recall exclude abstentions; consult coverage and exact over all cases.',
    'Holdout already used in historical rule development: not independent proof of generalization.',
    'This small synthetic corpus requires new independent real-world examples before promotion.'], parts, resource };
mkdirSync('tests/results', { recursive: true });
writeFileSync('tests/results/linear-classifier-latest.json', JSON.stringify(report, null, 2) + '\n');
const summary = parts.map(({ split, rules, linearCandidate, linearAccepted }) => ({ split, n: rules.n, rulesExact: rules.exact, linearExact: linearCandidate.exact, acceptedExact: linearAccepted.exact, coverage: linearAccepted.coverage, rulesF1: rules.f1, linearF1: linearCandidate.f1 }));
console.table(summary); console.log(JSON.stringify(resource, null, 2));
writeFileSync('training/local-intent/REPORT.md', '# Порівняння локального класифікатора\n\n' +
  '| Частина | N | Точний тип: правила | Точний тип: модель | Покриття впевнених прогнозів | F1 виявлення: правила | F1 виявлення: модель |\n|---|---:|---:|---:|---:|---:|---:|\n' +
  summary.map(row => `| ${row.split} | ${row.n} | ${(row.rulesExact * 100).toFixed(1)}% | ${(row.linearExact * 100).toFixed(1)}% | ${(row.coverage * 100).toFixed(1)}% | ${(row.rulesF1 * 100).toFixed(1)}% | ${(row.linearF1 * 100).toFixed(1)}% |`).join('\n') +
  `\n\nМодель: 65 544 параметри, int16, ${Buffer.byteLength(JSON.stringify(model))} байтів у JSON. Хеш даних: \`${model.datasetHash}\`.\n\n` +
  `CPU: ${resource.cpu}. Холодний прогноз: ${coldMs.toFixed(2)} мс; 200 прогнозів: медіана ${resource.medianMs.toFixed(2)}, p95 ${resource.p95Ms.toFixed(2)}, максимум ${resource.maxMs!.toFixed(2)} мс. Піковий RSS процесу оцінювання: ${(resource.processPeakRssBytes / 1048576).toFixed(1)} MiB; масив ваг: 256 KiB.\n\n` +
  report.caveats.map(text => `- ${text}`).join('\n') + '\n\nДеталі кожного сценарію: [JSON](../../tests/results/linear-classifier-latest.json).\n');
