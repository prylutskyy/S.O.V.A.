import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { LinearIntentClassifier } from '../../src/heuristics/linear-classifier';
import { SUPPORTED_FEATURE_DIMENSIONS } from '../../src/heuristics/linear-features';
import { trainModel } from './training';
import { digest, makeInput, readCorpus, type TrainingDataset } from './dataset';

const dimensions = Number(process.argv[3]);
if (!SUPPORTED_FEATURE_DIMENSIONS.includes(dimensions as typeof SUPPORTED_FEATURE_DIMENSIONS[number])) throw new Error('Unsupported size');
const source = readFileSync('training/local-intent/dataset.json', 'utf8');
const dataset = JSON.parse(source) as TrainingDataset;
const path = `.cache/local-classifier/model-${dimensions}.json`;
if (process.argv[2] === 'train') {
  writeFileSync(path, JSON.stringify(trainModel(dataset, source, dimensions)) + '\n');
} else if (process.argv[2] === 'measure') {
  const model = JSON.parse(readFileSync(path, 'utf8')) as ReturnType<typeof trainModel>;
  if (model.datasetHash !== digest(source) || model.dimensions !== dimensions) throw new Error('Invalid experiment provenance');
  const classifier = new LinearIntentClassifier(model);
  const coldInput = ['Для отримання виплати надішліть мені CVV та код із SMS.'];
  const coldStart = performance.now(); classifier.predict(makeInput(coldInput)); const coldMs = performance.now() - coldStart;
  const parts = ['train', 'validation', 'holdout'].map(split => {
    const entries = split === 'holdout' ? readCorpus('holdout').map(entry => ({ id: entry.id,
      label: entry.expected.detected ? entry.expected.intentType! : 'SAFE', messages: entry.messages.filter(message => message.speaker === 'interlocutor').map(message => message.text) }))
      : dataset.records.filter(record => record.split === split);
    return { split, rows: entries.map(entry => {
      const prediction = classifier.predict(makeInput(entry.messages));
      return { id: entry.id, expected: entry.label, candidate: prediction.candidate ?? 'ABSTAIN', decision: prediction.decision,
        score: prediction.score, margin: prediction.margin, status: prediction.status };
    }) };
  });
  const timings = { typical: [] as number[], long: [] as number[] };
  const long = ['слово '.repeat(341), 'перевірка '.repeat(227)];
  let timeouts = 0;
  for (let i = 0; i < 600; i++) {
    const kind = i % 2 ? 'typical' : 'long'; const start = performance.now();
    const prediction = classifier.predict(makeInput(kind === 'typical' ? coldInput : long));
    timings[kind].push(performance.now() - start);
    if (prediction.status === 'timeout') timeouts++;
  }
  const summarize = (samples: number[]) => {
    samples.sort((a, b) => a - b);
    return { n: samples.length, medianMs: samples[Math.floor(samples.length / 2)], p95Ms: samples[Math.floor(samples.length * .95)], maxMs: samples.at(-1)! };
  };
  console.log(JSON.stringify({ dimensions, parameters: dimensions * model.labels.length + model.bias.length,
    datasetHash: model.datasetHash, modelHash: digest(JSON.stringify(model)), modelBytes: Buffer.byteLength(JSON.stringify(model)),
    decodedWeightsBytes: dimensions * model.labels.length * 4, parts,
    resource: { cpu: cpus()[0]?.model, node: process.version, coldMs, typical: summarize(timings.typical), long: summarize(timings.long), timeouts,
      processPeakRssBytes: process.resourceUsage().maxRSS * 1024,
      scope: 'Separate CPU-only Node inference process per size; includes input preparation and datasets, excludes training. Not whole Chrome extension memory or old i3 certification.' } }));
} else throw new Error('Expected train or measure');
