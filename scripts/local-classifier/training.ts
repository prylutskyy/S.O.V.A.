import { extractLinearFeatures, FEATURE_DIMENSIONS, FEATURE_VERSION, LOCAL_LABELS } from '../../src/heuristics/linear-features';
import { makeInput, digest, type TrainingDataset } from './dataset';

export function trainModel(dataset: TrainingDataset, source: string, dimensions = FEATURE_DIMENSIONS) {
  if (dataset.schemaVersion !== 1 || dataset.records.some(record => !['development', 'regressions', 'social-engineering-pilot'].includes(record.source))) throw new Error('Training dataset must exclude holdout and pilot evaluation data');
  const train = dataset.records.filter(record => record.split === 'train');
  const validationGroups = new Set(dataset.records.filter(record => record.split === 'validation').map(record => record.group));
  if (train.some(record => validationGroups.has(record.group))) throw new Error('Group leakage');
  const examples = train.map(record => ({ x: extractLinearFeatures(makeInput(record.messages), Infinity, dimensions), y: LOCAL_LABELS.indexOf(record.label) }));
  if (examples.some(example => example.y < 0)) throw new Error('Unknown training label');
  const weights = new Float64Array(dimensions * LOCAL_LABELS.length);
  const bias = new Float64Array(LOCAL_LABELS.length);
  const counts = LOCAL_LABELS.map((_, label) => examples.filter(example => example.y === label).length);
  if (counts.some(count => count === 0)) throw new Error('Missing training class');
  let seed = 20261010;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let epoch = 0; epoch < 220; epoch++) {
    const order = examples.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const rate = 0.6 / Math.sqrt(1 + epoch / 25);
    for (const index of order) {
      const { x, y } = examples[index];
      const logits = LOCAL_LABELS.map((_, label) => x.reduce((sum, [feature, value]) => sum + weights[label * dimensions + feature] * value, bias[label]));
      const max = Math.max(...logits);
      const exps = logits.map(logit => Math.exp(logit - max));
      const sum = exps.reduce((a, b) => a + b, 0);
      const balance = examples.length / (LOCAL_LABELS.length * counts[y]);
      for (let label = 0; label < LOCAL_LABELS.length; label++) {
        const gradient = balance * (exps[label] / sum - (label === y ? 1 : 0));
        bias[label] -= rate * gradient;
        for (const [feature, value] of x) weights[label * dimensions + feature] -= rate * gradient * value;
      }
    }
    for (let i = 0; i < weights.length; i++) weights[i] *= 0.9995;
  }
  const maxWeight = weights.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const scale = maxWeight / 32767 || 1;
  const packed = Buffer.alloc(weights.length * 2);
  weights.forEach((weight, index) => packed.writeInt16LE(Math.round(weight / scale), index * 2));
  return { schemaVersion: 1, featureVersion: FEATURE_VERSION, dimensions, labels: [...LOCAL_LABELS], encoding: 'int16-le-base64', scale, weights: packed.toString('base64'), bias: [...bias], minScore: 0.6, minMargin: 0.15, datasetHash: digest(source), sourceHash: dataset.sourceHash, training: { algorithm: 'class-balanced multinomial logistic regression; SGD', seed: 20261010, epochs: 220, examples: train.length }, usage: 'shadow-only; scores uncalibrated; no mitigation authority' };
}
