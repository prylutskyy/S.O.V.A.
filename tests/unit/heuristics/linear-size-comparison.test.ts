import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import artifact from '../../../src/heuristics/models/local-intent-v1.json';
import { LinearIntentClassifier } from '../../../src/heuristics/linear-classifier';
import { extractLinearFeatures, featureHash, SUPPORTED_FEATURE_DIMENSIONS } from '../../../src/heuristics/linear-features';
import { prepareDataset, makeInput, digest } from '../../../scripts/local-classifier/dataset';
import { trainModel } from '../../../scripts/local-classifier/training';
import { comparisonMetrics } from '../../../scripts/local-classifier/comparison-metrics';

describe('Controlled comparison of linear model sizes', () => {
  const source = readFileSync('training/local-intent/dataset.json', 'utf8');
  const dataset = prepareDataset();
  it.each(SUPPORTED_FEATURE_DIMENSIONS)('trains and predicts with %i features and identical controls', dimensions => {
    const model = trainModel(dataset, source, dimensions);
    expect(model.datasetHash).toBe(digest(source));
    expect(model.training).toEqual(artifact.training);
    expect(model.minScore).toBe(artifact.minScore); expect(model.minMargin).toBe(artifact.minMargin);
    expect(Buffer.from(model.weights, 'base64').length).toBe(dimensions * 8 * 2);
    const input = makeInput(['Для отримання виплати надішліть мені CVV та код із SMS.']);
    const features = extractLinearFeatures(input, Infinity, dimensions);
    expect(features.every(([index]) => index >= 0 && index < dimensions)).toBe(true);
    const prediction = new LinearIntentClassifier(model).predict(input);
    expect(prediction.candidate).toBe('PAYMENT_CREDENTIAL_THEFT');
    expect(prediction.actionApplied).toBe(false);
    expect(prediction.status).not.toBe('unavailable');
    if (dimensions === 8192) expect(model).toEqual(artifact);
  }, 30_000); // Offline training, not the runtime decision-latency budget.
  it('uses the same hash before reducing it into different feature spaces', () => {
    for (const name of ['word:пароль', 'request:payment_secret:payment', 'word:CVV']) {
      expect(featureHash(name, 32768) % 8192).toBe(featureHash(name, 8192));
    }
  });
  it('rejects unsupported model dimensions', () => {
    expect(() => extractLinearFeatures(makeInput(['привіт']), Infinity, 512)).toThrow('Unsupported');
    expect(new LinearIntentClassifier({ ...artifact, dimensions: 512 }).predict(makeInput(['привіт'])).status).toBe('unavailable');
  });
  it('does not count abstentions as safe answers in detection or coverage', () => {
    const metrics = comparisonMetrics([{ expected: 'SAFE', actual: 'SAFE' },
      { expected: 'VERIFICATION_PHISHING', actual: 'ABSTAIN' },
      { expected: 'VERIFICATION_PHISHING', actual: 'VERIFICATION_PHISHING' }]);
    expect(metrics.coverage).toBeCloseTo(2 / 3);
    expect(metrics.correct).toBe(2);
    expect(metrics.recall).toBe(1);
    expect(metrics.recallIncludingAbstentions).toBe(.5);
  });
});
