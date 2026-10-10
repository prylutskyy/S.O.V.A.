import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { summarizeGroup } from './group-metrics';
import { afterAll, describe, expect, it } from 'vitest';
import { ChatSessionState } from '../../src/heuristics/chat-session-state';
import { getThreatMitigationAction, ThreatMitigationAction } from '../../src/heuristics/threat-mitigation-policy';

type CorpusCase = {
  id: string;
  tags: string[];
  assessment?: 'threat' | 'safe' | 'ambiguous';
  family?: string;
  messages: Array<{ speaker: 'interlocutor' | 'user'; text: string }>;
  expected: {
    detected: boolean;
    intentType: string | null;
    action: ThreatMitigationAction;
    minConfidence?: number;
    maxConfidence?: number;
  };
  notes: string;
};

type CorpusFile = { schemaVersion: number; cases: CorpusCase[] };
type Prediction = {
  id: string;
  corpus: string;
  assessment?: string;
  family?: string;
  expectedDetected: boolean;
  actualDetected: boolean;
  expectedType: string | null;
  actualType: string | null;
  expectedAction: ThreatMitigationAction;
  actualAction: ThreatMitigationAction;
  confidence: number;
  expectedMinConfidence?: number;
  expectedMaxConfidence?: number;
};

const corpusDirectory = resolve(process.cwd(), 'tests/evaluation/corpus');
const legacyNames = ['development', 'regressions', 'holdout'];
const corpusNames = [...legacyNames, 'challenge-v1'];
const corpusFiles = corpusNames.map((name) => ({
  name,
  path: resolve(corpusDirectory, `${name}.json`),
  data: JSON.parse(readFileSync(resolve(corpusDirectory, `${name}.json`), 'utf8')) as CorpusFile,
}));

const allCases = corpusFiles.flatMap(({ name, data }) =>
  data.cases.map((testCase) => ({ ...testCase, corpus: name }))
);
const predictions: Prediction[] = [];

function assertCorpusShape(name: string, corpus: CorpusFile): void {
  expect(corpus, `${name}.json must be an object`).toBeTypeOf('object');
  expect(corpus.schemaVersion, `${name}.json schemaVersion`).toBe(1);
  expect(corpus.cases, `${name}.json cases must be an array`).toBeInstanceOf(Array);

  for (const testCase of corpus.cases) {
    expect(testCase.id, `${name}: every case needs a non-empty id`).toMatch(/\S/);
    expect(testCase.tags, `${testCase.id}: tags must be an array`).toBeInstanceOf(Array);
    expect(testCase.messages.length, `${testCase.id}: add at least one message`).toBeGreaterThan(0);
    expect(testCase.expected.detected, `${testCase.id}: expected.detected`).toBeTypeOf('boolean');
    expect(['ALLOW', 'WARN', 'LOCK_INPUT'], `${testCase.id}: expected.action`)
      .toContain(testCase.expected.action);
    expect(
      testCase.expected.intentType === null || typeof testCase.expected.intentType === 'string',
      `${testCase.id}: expected.intentType must be a string or null`
    ).toBe(true);
    expect(testCase.notes, `${testCase.id}: notes must explain the label`).toBeTypeOf('string');

    for (const [index, message] of testCase.messages.entries()) {
      expect(['interlocutor', 'user'], `${testCase.id}: message ${index + 1} speaker`)
        .toContain(message.speaker);
      expect(message.text, `${testCase.id}: message ${index + 1} text`).toMatch(/\S/);
    }

    if (testCase.expected.detected) {
      expect(testCase.expected.intentType, `${testCase.id}: detected cases need an intentType`)
        .toMatch(/\S/);
    } else {
      expect(testCase.expected.intentType, `${testCase.id}: undetected cases use null intentType`)
        .toBeNull();
    }
  }
}

function printMetrics(): void {
  if (predictions.length === 0) {
    console.info('[corpus] No examples yet. Add cases to tests/evaluation/corpus/*.json.');
    return;
  }

  const metricsFor = (
    category: string,
    entries: Prediction[],
    isPositive: (entry: Prediction) => { expected: boolean; actual: boolean }
  ) => {
    const pairs = entries.map(isPositive);
    const tp = pairs.filter((pair) => pair.expected && pair.actual).length;
    const fp = pairs.filter((pair) => !pair.expected && pair.actual).length;
    const fn = pairs.filter((pair) => pair.expected && !pair.actual).length;
    const tn = pairs.filter((pair) => !pair.expected && !pair.actual).length;
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

    return {
      category,
      n: entries.length,
      TP: tp,
      FP: fp,
      FN: fn,
      TN: tn,
      precisionValue: precision,
      recallValue: recall,
      f1Value: f1,
      precision: `${(precision * 100).toFixed(1)}%`,
      recall: `${(recall * 100).toFixed(1)}%`,
      F1: `${(f1 * 100).toFixed(1)}%`,
    };
  };

  console.info('\n[corpus] Separate scores; ambiguous cases excluded from binary metrics:');
  console.table(corpusNames.map(name => metricsFor(name, predictions.filter(e => e.corpus === name && e.assessment !== 'ambiguous'), e => ({expected:e.expectedDetected, actual:e.actualDetected}))));
  const mismatches = predictions.filter((entry) =>
    entry.assessment !== 'ambiguous' && (entry.expectedDetected !== entry.actualDetected || entry.expectedType !== entry.actualType)
  );
  if (mismatches.length > 0) {
    console.info('[corpus] Cases that differ from the expected result:');
    console.table(mismatches.map(({ id, expectedDetected, actualDetected, expectedType, actualType }) => ({
      id, expectedDetected, actualDetected, expectedType, actualType,
    })));
  }
}

function writeEvaluationReport(): void {
  const reportPath = process.env.SOVA_EVAL_REPORT;
  if (!reportPath || predictions.length === 0) return;
  if (predictions.length !== allCases.length) throw new Error('Incomplete corpus execution: refusing to publish partial scores');

  const metricsFor = (entries: Prediction[], expectedType?: string | null) => {
    const pairs = entries.map((entry) => ({
      expected: expectedType === undefined ? entry.expectedDetected : entry.expectedType === expectedType,
      actual: expectedType === undefined ? entry.actualDetected : entry.actualType === expectedType,
    }));
    const tp = pairs.filter((pair) => pair.expected && pair.actual).length;
    const fp = pairs.filter((pair) => !pair.expected && pair.actual).length;
    const fn = pairs.filter((pair) => pair.expected && !pair.actual).length;
    const tn = pairs.filter((pair) => !pair.expected && !pair.actual).length;
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    return { n: entries.length, tp, fp, fn, tn, precision, recall, f1 };
  };
  const allTypes = Array.from(new Set(
    predictions.flatMap((entry) => [entry.expectedType, entry.actualType])
  )).filter((type): type is string => type !== null).sort();
  const cases = predictions.map((entry) => ({
    ...entry,
    scored: entry.assessment !== 'ambiguous',
    exactMatch: entry.expectedDetected === entry.actualDetected &&
      entry.expectedType === entry.actualType && entry.expectedAction === entry.actualAction &&
      (entry.expectedMinConfidence === undefined || entry.confidence >= entry.expectedMinConfidence) &&
      (entry.expectedMaxConfidence === undefined || entry.confidence <= entry.expectedMaxConfidence),
  }));
  const mismatches = cases.filter((entry) => entry.scored && !entry.exactMatch).map((entry) => ({
    id: entry.id,
    corpus: entry.corpus,
    expectedDetected: entry.expectedDetected,
    actualDetected: entry.actualDetected,
    expectedType: entry.expectedType,
    actualType: entry.actualType,
    expectedAction: entry.expectedAction,
    actualAction: entry.actualAction,
    confidence: entry.confidence,
    expectedMinConfidence: entry.expectedMinConfidence,
    expectedMaxConfidence: entry.expectedMaxConfidence,
  }));
  const legacyPredictions = predictions.filter(e => legacyNames.includes(e.corpus));
  const legacyCases = cases.filter(e => legacyNames.includes(e.corpus));
  const hashFor = (names: string[]) => {
    const h = createHash('sha256');
    for (const file of corpusFiles.filter(f => names.includes(f.name))) h.update(file.name).update(readFileSync(file.path, 'utf8').replace(/\r\n/g, '\n'));
    return h.digest('hex');
  };
  const groups = {
    regression: { ...summarizeGroup(legacyCases), corpusSha256: hashFor(legacyNames), status: 'used-for-tuning' },
    challenge: { ...summarizeGroup(cases.filter(e => e.corpus === 'challenge-v1')), corpusSha256: hashFor(['challenge-v1']), status: 'synthetic-awaiting-independent-review' },
  };
  const report = {
    schemaVersion: 2,
    groups,
    cases,
    generatedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA ?? 'local',
    corpusSha256: groups.regression.corpusSha256,
    combinedCorpusSha256: hashFor(corpusNames),
    totalCases: legacyCases.length,
    evaluatedCases: cases.length,
    exactMatches: groups.regression.exactMatches,
    exactMatchRate: groups.regression.exactMatchRate,
    overall: metricsFor(legacyPredictions),
    byCorpus: Object.fromEntries(corpusNames.map((name) => [
      name,
      metricsFor(predictions.filter((entry) => entry.corpus === name && entry.assessment !== 'ambiguous')),
    ])),
    byIntentType: Object.fromEntries(allTypes.map((type) => [
      type,
      metricsFor(legacyPredictions, type),
    ])),
    actionMismatches: groups.regression.actionMismatches,
    falseLockInputs: groups.regression.falseLockInputs,
    mismatches,
  };
  mkdirSync(resolve(reportPath, '..'), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.info(`[corpus] Machine-readable report written to ${reportPath}`);
}

describe('Evaluation corpus structure', () => {
  for (const { name, data } of corpusFiles) {
    it(`${name}.json follows the corpus format`, () => assertCorpusShape(name, data));
  }

  it('uses unique case IDs across all corpus files', () => {
    const ids = allCases.map((testCase) => testCase.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps exact conversation text out of holdout when it appears in development or regressions', () => {
    const keyFor = (testCase: CorpusCase) => testCase.messages
      .map((message) => message.text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase())
      .join('\n');
    const tuningTexts = new Set(
      allCases
        .filter((testCase) => testCase.corpus !== 'holdout')
        .map(keyFor)
    );
    const overlaps = allCases
      .filter((testCase) => testCase.corpus === 'holdout' && tuningTexts.has(keyFor(testCase)))
      .map((testCase) => testCase.id);

    expect(overlaps, 'Holdout messages must be independent of development and regression text').toEqual([]);
  });
});

describe('Local threat-classification evaluation corpus', () => {
  if (allCases.length === 0) {
    it.skip('add labeled cases to the JSON corpus files to enable evaluation', () => {});
  }

  if (allCases.length > 0) {
    it('matches the expected output for every scenario (sequential state isolation)', () => {
      const mismatches: Array<Record<string, unknown>> = [];

      for (const testCase of allCases) {
      ChatSessionState.reset();
      let result: ReturnType<typeof ChatSessionState.addMessageAndEvaluate> | undefined;

      for (const message of testCase.messages) {
        result = ChatSessionState.addMessageAndEvaluate(
          message.text,
          message.speaker === 'interlocutor' ? 'inbound' : 'outbound'
        );
      }

      expect(result, `${testCase.id}: scenario has at least one evaluated message`).toBeDefined();
      if (!result) throw new Error(`Missing result for ${testCase.id}`);
      expect(Number.isFinite(result.confidence ?? 0), `${testCase.id}: finite score`).toBe(true);

      const actualType = result.hasFormedIntent ? result.intentType || null : null;
      const actualAction = getThreatMitigationAction(result.hasFormedIntent, actualType);
      predictions.push({
        id: testCase.id,
        corpus: testCase.corpus,
        assessment: testCase.assessment,
        family: testCase.family,
        expectedDetected: testCase.expected.detected,
        actualDetected: result.hasFormedIntent,
        expectedType: testCase.expected.intentType,
        actualType,
        expectedAction: testCase.expected.action,
        actualAction,
        confidence: result.confidence ?? 0,
        expectedMinConfidence: testCase.expected.minConfidence,
        expectedMaxConfidence: testCase.expected.maxConfidence,
      });

      if (testCase.corpus !== 'challenge-v1' && (
        result.hasFormedIntent !== testCase.expected.detected ||
        actualType !== testCase.expected.intentType ||
        actualAction !== testCase.expected.action
      )) {
        mismatches.push({
          id: testCase.id,
          corpus: testCase.corpus,
          expectedDetected: testCase.expected.detected,
          actualDetected: result.hasFormedIntent,
          expectedType: testCase.expected.intentType,
          actualType,
          expectedAction: testCase.expected.action,
          actualAction,
        });
      }

      if (testCase.corpus !== 'challenge-v1' && testCase.expected.minConfidence !== undefined) {
        if ((result.confidence ?? 0) < testCase.expected.minConfidence) {
          mismatches.push({ id: testCase.id, field: 'minConfidence', expected: testCase.expected.minConfidence, actual: result.confidence ?? 0 });
        }
      }
      if (testCase.corpus !== 'challenge-v1' && testCase.expected.maxConfidence !== undefined) {
        if ((result.confidence ?? 0) > testCase.expected.maxConfidence) {
          mismatches.push({ id: testCase.id, field: 'maxConfidence', expected: testCase.expected.maxConfidence, actual: result.confidence ?? 0 });
        }
      }

      }

      if (mismatches.length > 0) console.table(mismatches);
      expect(mismatches.length, 'See mismatch table above for scenario IDs and expected/actual results')
        .toBe(0);
    }, 30_000);
  }

  afterAll(() => {
    printMetrics();
    writeEvaluationReport();
  });
});
