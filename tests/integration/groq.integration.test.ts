import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GroqDriver } from '../../src/ai/cloud/drivers/groq-driver';

type CorpusCase = {
  id: string;
  messages: Array<{ speaker: string; text: string }>;
  expected: { detected: boolean; intentType: string | null; action: string };
};

type CorpusFile = { cases: CorpusCase[] };

const enabled = process.env.GROQ_INTEGRATION === '1';
const corpusName = process.env.GROQ_CORPUS || 'holdout';
const corpusPath = resolve(process.cwd(), `tests/evaluation/corpus/${corpusName}.json`);
const driver = new GroqDriver();

function selectCases(cases: CorpusCase[], limit: number): CorpusCase[] {
  if (limit <= 0 || limit >= cases.length) return cases;

  // Spread the sample across the corpus so a small run includes both labels
  // and does not only evaluate the first threat category.
  const selected: CorpusCase[] = [];
  const step = cases.length / limit;
  for (let i = 0; i < limit; i++) selected.push(cases[Math.floor(i * step)]);

  const hasBenign = selected.some((scenario) => !scenario.expected.detected);
  const hasThreat = selected.some((scenario) => scenario.expected.detected);
  if ((!hasBenign || !hasThreat) && cases.some((scenario) => !scenario.expected.detected)) {
    selected[selected.length - 1] = cases.find((scenario) => !scenario.expected.detected)!;
  }
  return [...new Map(selected.map((scenario) => [scenario.id, scenario])).values()];
}

describe.skipIf(!enabled)('Groq live integration', () => {
  it('classifies selected corpus cases and reports detection metrics', async () => {
    const apiKey = process.env.GROQ_API_KEY;
    expect(apiKey, 'Set GROQ_API_KEY when GROQ_INTEGRATION=1').toBeTruthy();

    expect(['development', 'regressions', 'holdout']).toContain(corpusName);
    const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as CorpusFile;
    const limit = Number.parseInt(process.env.GROQ_TEST_LIMIT || '12', 10);
    expect(Number.isFinite(limit) && limit >= 0, 'GROQ_TEST_LIMIT must be 0 or a positive integer').toBe(true);
    const scenarios = selectCases(corpus.cases, limit);
    expect(scenarios.length, 'The selected corpus must contain scenarios').toBeGreaterThan(0);

    const model = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
    if (process.env.GROQ_CHECK_MODEL === '1') {
      const models = await driver.listModels(apiKey!);
      expect(models.some((candidate) => candidate.id === model), `Groq does not list configured model ${model}`).toBe(true);
    }

    let truePositive = 0;
    let trueNegative = 0;
    let falsePositive = 0;
    let falseNegative = 0;
    const runResults: Array<{ id: string; expected: boolean; actual: boolean; confidence: number; latencyMs: number }> = [];

    for (const scenario of scenarios) {
      const prompt = scenario.messages
        .map(({ speaker, text }) => `${speaker === 'user' ? '[Ви]' : '[Співрозмовник]'}: ${text}`)
        .join('\n');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Number(process.env.GROQ_TIMEOUT_MS || 30_000));
      try {
        const result = await driver.verifyThreat({
          provider: 'groq',
          apiKey: apiKey!,
          model,
          sanitizedPrompt: prompt,
          signal: controller.signal,
        });

        expect(result.provider).toBe('groq');
        expect(result.modelUsed).toBe(model);
        expect(typeof result.isScam).toBe('boolean');
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(100);
        expect(result.reasoning.trim().length).toBeGreaterThan(0);
        expect(result.rawResponse, `Groq returned no raw JSON for ${scenario.id}`).toBeTruthy();
        const raw = JSON.parse(result.rawResponse!);
        expect(typeof (raw.isScam ?? raw.is_scam), `Invalid isScam field for ${scenario.id}`).toBe('boolean');
        expect(typeof raw.confidence, `Invalid confidence field for ${scenario.id}`).toBe('number');

        if (scenario.expected.detected && result.isScam) truePositive++;
        else if (scenario.expected.detected) falseNegative++;
        else if (result.isScam) falsePositive++;
        else trueNegative++;
        runResults.push({ id: scenario.id, expected: scenario.expected.detected, actual: result.isScam, confidence: result.confidence, latencyMs: result.latencyMs });
      } finally {
        clearTimeout(timeout);
      }
    }

    const accuracy = (truePositive + trueNegative) / scenarios.length;
    console.info('[Groq integration metrics]', JSON.stringify({
      model, corpus: corpusName, cases: scenarios.length, truePositive, trueNegative,
      falsePositive, falseNegative, accuracy: Number(accuracy.toFixed(4)), results: runResults,
    }));

    const minAccuracy = process.env.GROQ_MIN_ACCURACY;
    if (minAccuracy !== undefined) {
      const threshold = Number(minAccuracy);
      expect(Number.isFinite(threshold) && threshold >= 0 && threshold <= 1, 'GROQ_MIN_ACCURACY must be between 0 and 1').toBe(true);
      expect(accuracy, `Groq accuracy is below configured threshold (${falsePositive} FP, ${falseNegative} FN)`).toBeGreaterThanOrEqual(threshold);
    }
  }, 10 * 60_000);
});
