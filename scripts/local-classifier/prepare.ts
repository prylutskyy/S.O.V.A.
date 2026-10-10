import { mkdirSync, writeFileSync } from 'node:fs';
import { prepareDataset } from './dataset';
const dataset = prepareDataset();
mkdirSync('training/local-intent', { recursive: true });
writeFileSync('training/local-intent/dataset.json', JSON.stringify(dataset, null, 2) + '\n');
console.log(JSON.stringify({ sourceHash: dataset.sourceHash, train: dataset.records.filter(record => record.split === 'train').length, validation: dataset.records.filter(record => record.split === 'validation').length }, null, 2));
