import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import baseline from '../../src/heuristics/models/local-intent-v1.json';
import { LinearIntentClassifier } from '../../src/heuristics/linear-classifier';
import { trainModel } from './training';
import { digest, makeInput, readCorpus } from './dataset';
import { readPilot, preparePilotDataset, pilotContext, type PilotExpectation } from './pilot-data';

const corpus = readPilot(), dataset = preparePilotDataset(corpus), source = JSON.stringify(dataset);
if (digest(readFileSync('training/local-intent/dataset.json', 'utf8')) !== baseline.datasetHash) throw new Error('Baseline dataset changed');
const modelPath = '.cache/local-classifier/social-pilot-model.json';
if (process.argv[2] === 'train') {
  writeFileSync('.cache/local-classifier/social-pilot-dataset.json', source + '\n');
  writeFileSync(modelPath, JSON.stringify(trainModel(dataset, source)) + '\n');
} else if (process.argv[2] === 'measure') {
  const model = JSON.parse(readFileSync(modelPath, 'utf8')) as typeof baseline;
  if (model.datasetHash !== digest(source) || model.dimensions !== baseline.dimensions) throw new Error('Stale pilot model');
  const classifiers = { baseline: new LinearIntentClassifier(baseline), candidate: new LinearIntentClassifier(model) };
  const timings = {} as Record<string, { coldMs: number; medianMs: number; p95Ms: number; maxMs: number; timeouts: number }>;
  for (const [name, classifier] of Object.entries(classifiers)) {
    const start = performance.now(); classifier.predict(makeInput(['Для отримання виплати надішліть мені CVV та код із SMS.']));
    const coldMs = performance.now() - start;
    const samples: number[] = []; let timeouts = 0;
    for (let i = 0; i < 300; i++) {
      const tick = performance.now();
      const result = classifier.predict(makeInput(i % 2 ? ['слово '.repeat(341), 'перевірка '.repeat(227)] : ['Для отримання виплати надішліть мені CVV та код із SMS.']));
      samples.push(performance.now() - tick); if (result.status === 'timeout') timeouts++;
    }
    samples.sort((a, b) => a - b);
    timings[name] = { coldMs, medianMs: samples[150], p95Ms: samples[285], maxMs: samples.at(-1)!, timeouts };
  }
  const predict = (messages: string[]) => Object.fromEntries(Object.entries(classifiers).map(([name, classifier]) => [name, classifier.predict(makeInput(messages))]));
  const existing = ['development', 'regressions', 'holdout'].map(split => ({ split, rows: readCorpus(split).map(entry => ({ id: entry.id,
    expected: entry.expected.detected ? entry.expected.intentType : 'SAFE', ...predict(entry.messages.filter(message => message.speaker === 'interlocutor').map(message => message.text)) })) }));
  const steps = corpus.cases.flatMap(entry => entry.messages.flatMap((message, index) => message.expected ? [{ id: `${entry.id}:step-${index}`, caseId: entry.id,
    family: entry.family, split: entry.split, topic: entry.topic, terminal: index === entry.messages.length - 1,
    expected: message.expected as PilotExpectation, ...predict(pilotContext(entry, index)) }] : []));
  console.log(JSON.stringify({ datasetHash: model.datasetHash, baselineHash: digest(JSON.stringify(baseline)), candidateHash: digest(JSON.stringify(model)),
    corpusHash: digest(JSON.stringify(corpus)), parameters: model.dimensions * model.labels.length + model.bias.length,
    trainingExamples: model.training.examples, existing, steps,
    resource: { cpu: cpus()[0]?.model, node: process.version, timings, processPeakRssBytes: process.resourceUsage().maxRSS * 1024,
      decodedWeightsPerModelBytes: model.dimensions * model.labels.length * 4,
      scope: 'CPU-only Node measurement process with both models and datasets; training runs separately; not total browser extension memory. Cold comparisons share a process and JIT warmup is not identical.' } }));
} else throw new Error('Expected train or measure');
