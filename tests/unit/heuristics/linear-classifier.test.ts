import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import model from '../../../src/heuristics/models/local-intent-v1.json';
import { LinearIntentClassifier, shadowIntentClassifier } from '../../../src/heuristics/linear-classifier';
import { boundedLocalMessages, extractLinearFeatures, LOCAL_LABELS } from '../../../src/heuristics/linear-features';
import { ChatSessionState } from '../../../src/heuristics/chat-session-state';
import { digest, makeInput, prepareDataset } from '../../../scripts/local-classifier/dataset';

describe('Learned linear classifier: shadow-only safety and reproducibility', () => {
  it('hashes identical training text consistently across LF and Windows CRLF', () => {
    expect(digest('one\r\ntwo\r\n')).toBe(digest('one\ntwo\n'));
  });
  beforeEach(() => ChatSessionState.reset());
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); ChatSessionState.reset(); });

  it('prepares exactly the versioned dataset without holdout or outbound text', () => {
    const dataset = prepareDataset();
    expect(dataset).toEqual(JSON.parse(readFileSync('training/local-intent/dataset.json', 'utf8')));
    expect(dataset.records.every(record => ['development', 'regressions'].includes(record.source))).toBe(true);
    expect(dataset.records.some(record => record.id.startsWith('holdout'))).toBe(false);
    expect(digest(readFileSync('training/local-intent/dataset.json', 'utf8'))).toBe(model.datasetHash);
  });
  it('keeps duplicate groups disjoint and every class represented', () => {
    const dataset = prepareDataset();
    const train = dataset.records.filter(record => record.split === 'train');
    const validation = dataset.records.filter(record => record.split === 'validation');
    expect(train.every(record => !validation.some(other => other.group === record.group))).toBe(true);
    for (const label of LOCAL_LABELS) {
      expect(train.some(record => record.label === label)).toBe(true);
      expect(validation.some(record => record.label === label)).toBe(true);
    }
  });
  it('shares normalized, deterministic sparse features between training and runtime', () => {
    const input = makeInput(['Надішліть мені CVV для отримання виплати']);
    const features = extractLinearFeatures(input);
    expect(extractLinearFeatures(input)).toEqual(features);
    expect(features.reduce((sum, [, value]) => sum + value * value, 0)).toBeCloseTo(1);
    expect(features.every(([index, value]) => index >= 0 && index < 8192 && Number.isFinite(value))).toBe(true);
  });
  it('predicts without any mitigation authority or raw text in the result', () => {
    const classifier = new LinearIntentClassifier();
    const prediction = classifier.predict(makeInput(['Для отримання виплати надішліть мені CVV та код із SMS.']));
    expect(prediction.candidate).toBe('PAYMENT_CREDENTIAL_THEFT');
    expect(prediction.mode).toBe('shadow'); expect(prediction.actionApplied).toBe(false);
    expect(prediction.score).toBeGreaterThanOrEqual(0); expect(prediction.score).toBeLessThanOrEqual(1);
    expect(JSON.stringify(prediction)).not.toContain('CVV');
  });
  it('abstains on empty input and exceeded deadlines', () => {
    const classifier = new LinearIntentClassifier();
    expect(classifier.predict({ messages: [], frames: [] }).decision).toBe('ABSTAIN');
    const timed = classifier.predict(makeInput(['привіт']), 0);
    expect(timed.status).toBe('timeout'); expect(timed.decision).toBe('ABSTAIN');
  });
  it('fails closed on a corrupt model without throwing', () => {
    const corrupt = new LinearIntentClassifier({ ...model, weights: 'broken' });
    expect(corrupt.predict(makeInput(['привіт'])).status).toBe('unavailable');
    expect(corrupt.predict(makeInput(['привіт'])).decision).toBe('ABSTAIN');
  });
  it('bounds context and abstains when content was truncated', () => {
    expect(boundedLocalMessages(Array(20).fill('привіт')).messages).toHaveLength(4);
    expect(boundedLocalMessages(Array(20).fill('привіт')).truncated).toBe(false);
    const bounded = boundedLocalMessages(Array(5).fill('а'.repeat(5000)));
    expect(bounded.messages.join('').length).toBeLessThanOrEqual(4096);
    const prediction = new LinearIntentClassifier().predict({ messages: ['а'.repeat(5000)], frames: [] });
    expect(prediction.truncated).toBe(true); expect(prediction.decision).toBe('ABSTAIN');
  });
  it('never changes the rules even when the model strongly disagrees', () => {
    const text = 'Давайте продовжимо спілкування у Telegram, тут незручно.';
    const baseline = ChatSessionState.addMessageAndEvaluate(text, 'inbound');
    ChatSessionState.reset();
    vi.spyOn(shadowIntentClassifier, 'predict').mockReturnValue({ mode: 'shadow', actionApplied: false, status: 'ok',
      decision: 'SAFE', candidate: 'SAFE', score: 1, margin: 1, elapsedMs: 0, truncated: false, datasetHash: model.datasetHash });
    const result = ChatSessionState.addMessageAndEvaluate(text, 'inbound');
    expect(result.hasFormedIntent).toBe(baseline.hasFormedIntent);
    expect(result.intentType).toBe(baseline.intentType);
    expect(result.confidence).toBe(baseline.confidence);
    expect(result.localClassifier?.decision).toBe('SAFE');
  });
  it('ignores outgoing evidence, caches predictions, and resets between sessions', () => {
    const spy = vi.spyOn(shadowIntentClassifier, 'predict');
    ChatSessionState.addMessageAndEvaluate('привіт', 'outbound'); expect(spy).not.toHaveBeenCalled();
    const first = ChatSessionState.addMessageAndEvaluate('Добрий день', 'inbound');
    const next = ChatSessionState.addMessageAndEvaluate('Надішліть CVV та пароль', 'outbound');
    expect(spy).toHaveBeenCalledTimes(1); expect(next.localClassifier).toBe(first.localClassifier);
    expect(spy.mock.calls[0][0].messages).toEqual(['Добрий день']);
    ChatSessionState.reset(); ChatSessionState.addMessageAndEvaluate('Добрий день', 'inbound');
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it('excludes stale messages from the model context', () => {
    vi.useFakeTimers(); const spy = vi.spyOn(shadowIntentClassifier, 'predict');
    ChatSessionState.addMessageAndEvaluate('Старий запит CVV', 'inbound');
    vi.advanceTimersByTime(61_000);
    ChatSessionState.addMessageAndEvaluate('Дякую, гарного дня', 'inbound');
    expect(spy.mock.calls.at(-1)?.[0].messages).toEqual(['Дякую, гарного дня']);
  });
  it('stays within the decision target on this test host for bounded inputs', () => {
    const start = performance.now();
    const prediction = new LinearIntentClassifier().predict(makeInput(['слово '.repeat(341), 'текст '.repeat(341)]));
    expect(performance.now() - start).toBeLessThan(500);
    expect(prediction.status).not.toBe('timeout');
    expect(Buffer.from(model.weights, 'base64').length).toBe(131072);
  });
});
