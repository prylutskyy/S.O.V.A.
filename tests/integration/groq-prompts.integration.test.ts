import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GroqDriver } from '../../src/ai/cloud/drivers/groq-driver';
import { OutboundDataSanitizer } from '../../src/privacy/outbound-data-sanitizer';
import { IntentClassifier } from '../../src/heuristics/intent-classifier';
import { PseudonymizationContext } from '../../src/privacy/pseudonymization-context';

type Message = { speaker: string; text: string; atMs?: number };
type Scenario = { id: string; annotationReview?: string; messages: Message[]; expected: { detected: boolean; intentType: string | null; action?: string } };
const enabled = process.env.GROQ_INTEGRATION === '1' && process.env.GROQ_PROMPT_COMPARE === '1';
const paired = process.env.GROQ_COMPARISON_MODE === 'paired';
const smoke = !paired && process.env.GROQ_COMPARISON_MODE !== 'full';
const variants: Array<'text-only' | 'observations' | 'compact' | 'legacy' | 'legacy-wrong-hypothesis'> = paired ?
  ['observations', 'compact'] : smoke ?
  ['observations', 'compact', 'legacy-wrong-hypothesis'] :
  ['text-only', 'observations', 'compact', 'legacy', 'legacy-wrong-hypothesis'];

describe.skipIf(!enabled)('Groq prompt comparison', () => {
  it('compares matched dialogues without counting failed requests as safe', async () => {
    const key = process.env.GROQ_API_KEY;
    expect(key, 'Set GROQ_API_KEY for live comparison').toBeTruthy();
    const name = process.env.GROQ_CORPUS || 'regressions';
    expect(['development', 'regressions', 'holdout']).toContain(name);
    const corpus = JSON.parse(readFileSync(resolve(`tests/evaluation/corpus/${name}.json`), 'utf8'));
    const limit = Number(process.env.GROQ_TEST_LIMIT || 6);
    expect(Number.isInteger(limit) && limit > 0).toBe(true);
    let cases: Scenario[] = corpus.cases.filter((_: Scenario, i: number) =>
      i % Math.max(1, Math.floor(corpus.cases.length / limit)) === 0).slice(0, limit);
    // Add gradual authority pretexts, advice and safe counterexamples from the historical pilot.
    const pilot = JSON.parse(readFileSync(resolve('training/local-intent/social-engineering-pilot.json'), 'utf8'));
    if (smoke) cases = corpus.cases.filter((c: Scenario) => ['safe2-reg-016', 'reg-verification-001'].includes(c.id));
    for (const c of pilot.cases.filter((c: any) => paired ? false : smoke ?
      ['pilot-lead-10-safe', 'pilot-media-09-threat'].includes(c.id) : c.split === 'test')) {
      const last = c.messages.filter((m: any) => m.expected).at(-1);
      if (!last || last.expected.kind === 'ambiguous') continue;
      cases.push({ id: c.id, messages: c.messages,
        expected: { detected: last.expected.kind === 'threat',
          intentType: last.expected.label === 'SAFE' ? null : last.expected.label,
          action: last.expected.maxAction } });
    }
    if (paired) cases = JSON.parse(readFileSync(resolve('training/groq-prompts/cohort-v1.json'), 'utf8')).cases;
    const model = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
    const timeoutMs = Number(process.env.GROQ_TIMEOUT_MS || 30000);
    expect(Number.isFinite(timeoutMs) && timeoutMs > 0).toBe(true);
    const maxRequests = Number(process.env.GROQ_MAX_REQUESTS || 12);
    const intervalMs = Math.max(3000, Number(process.env.GROQ_INTERVAL_MS || 7000));
    expect(Number.isFinite(intervalMs) && Number.isInteger(maxRequests) && maxRequests > 0).toBe(true);
    expect(cases.length * variants.length, 'Increase GROQ_MAX_REQUESTS explicitly for an extended run').toBeLessThanOrEqual(maxRequests);
    if (smoke) expect(cases.length).toBe(4);
    const driver = new GroqDriver();
    const models = await driver.listModels(key!);
    expect(models.some(m => m.id === model), 'Configured model must exist before sending comparison requests').toBe(true);
    const outputPath = resolve(`tests/results/groq-prompt-${paired ? 'paired' : 'comparison'}.json`);
    const corpusSha256 = createHash('sha256').update(JSON.stringify(cases)).digest('hex');
    const results: Array<Record<string, any>> = [];
    if (process.env.GROQ_RESUME === '1') {
      const previous = JSON.parse(readFileSync(outputPath, 'utf8'));
      expect(previous.model).toBe(model);
      expect(previous.corpusSha256).toBe(corpusSha256);
      results.push(...previous.results);
    }
    const completed = new Set(results.filter(r => r.status === 'completed').map(r => `${r.id}:${r.variant}`));
    let lastStart = 0;
    let rateLimited = false;
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      const latest = c.messages.filter(m => m.speaker !== 'user').at(-1)?.text || '';
      const local = IntentClassifier.classify(latest);
      const privacySession = new PseudonymizationContext();
      const dialogueHistory = OutboundDataSanitizer.sanitize(c.messages.map(m =>
        `${m.atMs === undefined ? '' : `[+${m.atMs}ms] `}${m.speaker === 'user' ? '[Ви]' : '[Співрозмовник]'}: ${m.text}`).join('\n'), { privacySession }).sanitizedText;
      const payload = OutboundDataSanitizer.sanitize(latest, { privacySession });
      const end = c.messages.at(-1)?.atMs || 0;
      const context = { privacySession, dialogueHistory, sourcePlatform: 'synthetic-test',
        dialogueMessages: c.messages.map(m => ({
          speaker: m.speaker === 'user' ? 'user' as const : 'interlocutor' as const,
          text: OutboundDataSanitizer.sanitize(m.text, { privacySession }).sanitizedText,
          observedAgeMs: Math.max(0, end - (m.atMs ?? end)),
        })),
        intentType: local.intentType || 'UNKNOWN',
        detectedKeywords: local.matchedSpans.map(s => s.text),
        suspiciousUrls: local.suspiciousUrls || [] };
      // Rotate order to reduce the association between variant and API/time order.
      const order = [...variants.slice(i % variants.length), ...variants.slice(0, i % variants.length)];
      for (const variant of order) {
        if (rateLimited) break;
        if (completed.has(`${c.id}:${variant}`)) continue;
        if (results.length >= maxRequests) break;
        const wrong = c.expected.detected ? 'UNKNOWN' : 'MILITARY_SABOTAGE_RECRUITMENT';
        const prompt = OutboundDataSanitizer.buildCloudPrompt(payload,
          variant === 'legacy-wrong-hypothesis' ? { ...context, intentType: wrong,
            raisedFlags: [`Виявлено загрозу: ${wrong}`] } : context,
          variant === 'legacy-wrong-hypothesis' ? 'legacy' : variant);
        const controller = new AbortController();
        await new Promise(resolve => setTimeout(resolve, Math.max(0, lastStart + intervalMs - Date.now())));
        lastStart = Date.now();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const start = performance.now();
        try {
          const reply = await driver.verifyThreat({ provider: 'groq', apiKey: key!, model,
            sanitizedPrompt: prompt, signal: controller.signal });
          results.push({ id: c.id, variant, expected: c.expected, status: 'completed',
            annotationReview: c.annotationReview,
            actual: reply.isScam, type: reply.scamType, confidence: reply.confidence,
            latencyMs: reply.latencyMs,
            promptBytes: new TextEncoder().encode(prompt).length, tokenUsage: reply.tokenUsage,
            // This is a diagnostic proxy, not execution of the real protection lifecycle.
            excessLockCandidate: !c.expected.detected && reply.isScam && reply.confidence >= 75 &&
              ['MILITARY_SABOTAGE_RECRUITMENT', 'CRYPTO_WALLET_COMPROMISE'].includes(reply.scamType || '') });
        } catch (error: any) {
          rateLimited = error?.status === 429;
          results.push({ id: c.id, variant, expected: c.expected,
            status: rateLimited ? 'rate-limited' : controller.signal.aborted ? 'timeout' : 'error',
            limitKind: error?.limitKind, retryAfter: error?.retryAfter,
            latencyMs: performance.now() - start });
        } finally { clearTimeout(timeout); }
        console.info(`[Groq comparison] ${results.length}/${cases.length * variants.length}: ${c.id} ${variant} ${results.at(-1)?.status}`);
        mkdirSync(resolve('tests/results'), { recursive: true });
        writeFileSync(outputPath, JSON.stringify({ model, corpusSha256, results, inProgress: true }, null, 2));
      }
    }
    const summaries = variants.map(variant => {
      const rows = results.filter(r => r.variant === variant);
      const valid = rows.filter(r => r.status === 'completed');
      const count = (expected: boolean, actual: boolean) => valid.filter(r =>
        r.expected.detected === expected && r.actual === actual).length;
      const tp = count(true, true), fp = count(false, true), fn = count(true, false), tn = count(false, false);
      const latencies = rows.map(r => r.latencyMs).sort((a, b) => a - b);
      return { variant, requests: rows.length, completed: valid.length, errors: rows.length - valid.length,
        coverage: valid.length / rows.length, tp, fp, fn, tn,
        f1: 2 * tp + fp + fn ? 2 * tp / (2 * tp + fp + fn) : null,
        exactTypeMatches: valid.filter(r => r.actual === r.expected.detected &&
          (!r.actual || r.type === r.expected.intentType)).length,
        excessLockCandidates: valid.filter(r => r.excessLockCandidate).length,
        meanInputTokens: valid.length ? valid.reduce((sum, r) => sum + (r.tokenUsage?.input || 0), 0) / valid.length : null,
        p95Ms: latencies[Math.ceil(latencies.length * .95) - 1] };
    });
    const report = { timestamp: new Date().toISOString(), model, corpus: name,
      mode: paired ? 'paired' : smoke ? 'smoke' : 'full', maxRequests, intervalMs, rateLimited,
      corpusSha256,
      note: 'Historical synthetic cases; same independent system instruction across all variants. Not a blind holdout or browser action test. No dialogue text or API keys persisted.',
      summaries, results };
    mkdirSync(resolve('tests/results'), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.table(summaries);
    expect(results.filter(r => r.status === 'completed').length).toBe(cases.length * variants.length);
    expect(results.filter(r => r.status !== 'completed').length,
      'Request errors are reported separately, never interpreted as SAFE').toBe(0);
  }, 30 * 60_000);
});
