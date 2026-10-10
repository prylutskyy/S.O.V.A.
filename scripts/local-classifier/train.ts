import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { digest, prepareDataset, type TrainingDataset } from './dataset';
import { trainModel } from './training';

const source = readFileSync('training/local-intent/dataset.json', 'utf8');
const dataset = JSON.parse(source) as TrainingDataset;
if (JSON.stringify(dataset) !== JSON.stringify(prepareDataset())) throw new Error('Dataset stale or modified: run classifier:prepare');
const model = trainModel(dataset, source);
mkdirSync('src/heuristics/models', { recursive: true });
writeFileSync('src/heuristics/models/local-intent-v1.json', JSON.stringify(model) + '\n');
console.log(JSON.stringify({ examples: model.training.examples, parameters: model.dimensions * model.labels.length + model.bias.length,
  packedBytes: Buffer.from(model.weights, 'base64').length, modelBytes: Buffer.byteLength(JSON.stringify(model)), datasetHash: digest(source) }, null, 2));
