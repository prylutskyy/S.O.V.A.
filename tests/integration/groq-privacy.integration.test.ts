import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import corpus from '../fixtures/groq-privacy-smoke.json';
import { preparePrivacySmoke } from '../helpers/privacy-smoke';
import { GroqDriver } from '../../src/ai/cloud/drivers/groq-driver';

const enabled = process.env.GROQ_INTEGRATION === '1' && process.env.GROQ_PRIVACY_SMOKE === '1';
describe.skipIf(!enabled)('Groq privacy smoke: sanitized production prompts only', () => {
  it('checks outbound privacy before inference and records classification separately', async () => {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error('Supply a test key through process memory or hidden input');
    const prepared = corpus.cases.map(c => ({ c, ...preparePrivacySmoke(c) }));
    // No call is allowed until every case passes preflight. Do not print raw values.
    if (prepared.some(p => p.leaks.length || p.missingMeaning.length)) throw new Error('Privacy preflight failed; no requests sent');
    const estimates = prepared.map(p => Buffer.byteLength(p.prompt, 'utf8') + 1536);
    const budget = estimates.reduce((a, b) => a + b, 0);
    if (budget > 60_000 || estimates.some(n => n > 7000)) throw new Error('Conservative smoke token budget exceeded');
    const model = 'qwen/qwen3.8-27b';
    const results: any[] = [];
    const reservations: Array<{ start: number; cost: number }> = [];
    const driver = new GroqDriver();
    const realFetch = globalThis.fetch;
    let current: typeof prepared[number] | undefined;
    let boundaryChecks = 0;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (String(url) !== 'https://api.groq.com/openai/v1/chat/completions') throw new Error('Unexpected endpoint');
      const body = JSON.parse(String(options?.body));
      const outbound = body.messages.map((m: any) => m.content).join('\n');
      if (!current || current.c.forbidden.some(v => outbound.includes(v))) throw new Error('Outbound privacy violation; request blocked');
      if (outbound.includes(current.c.id)) throw new Error('Scenario metadata leaked into prompt');
      boundaryChecks++;
      return realFetch(url, options);
    });
    const save = (inProgress: boolean) => {
      mkdirSync('tests/results', { recursive: true });
      writeFileSync('tests/results/groq-privacy-smoke.json', JSON.stringify({ schemaVersion: 1,
        generatedAt: new Date().toISOString(), model, cohortSha256: createHash('sha256').update(JSON.stringify(corpus)).digest('hex'),
        conservativeTokenBudget: budget, tokenCeiling: 60_000, requestsPerMinuteCeiling: 6,
        rollingTokensPerMinuteCeiling: 7000, accountLimitsProvided: { rpm: 30, tpm: 8000, tpd: 200000, usedBeforeRunApprox: 102000 },
        preflightPassed: prepared.length, boundaryChecks, plannedRequests: prepared.length, inProgress,
        results, totalTokens: results.reduce((sum, r) => sum + (r.tokenUsage?.total ?? 0), 0),
        completed: results.filter(r => r.status === 'completed').length,
        exactMatches: results.filter(r => r.status === 'completed' && r.exactMatch).length,
        scope: 'Synthetic privacy smoke only; no raw control, no real PII, no general accuracy or browser-lifecycle claim.' }, null, 2) + '\n');
    };
    let lastStart = 0;
    try {
      for (let i = 0; i < prepared.length; i++) {
        current = prepared[i];
        for (;;) {
          const now = Date.now();
          const active = reservations.filter(r => now - r.start < 60_000);
          const used = active.reduce((sum, r) => sum + r.cost, 0);
          const timeWait = Math.max(0, lastStart + 10_000 - now);
          const tokenWait = used + estimates[i] > 7000 ? Math.max(1, active[0].start + 60_100 - now) : 0;
          const wait = Math.max(timeWait, tokenWait);
          if (!wait) break;
          console.info(`[privacy-smoke] Waiting ${Math.ceil(wait / 1000)}s for request/token budget`);
          await new Promise(resolve => setTimeout(resolve, Math.min(wait, 30_000)));
        }
        lastStart = Date.now();
        const reservation = { start: lastStart, cost: estimates[i] };
        reservations.push(reservation);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);
        try {
          const reply = await driver.verifyThreat({ provider: 'groq', apiKey: key, model, sanitizedPrompt: current.prompt, signal: controller.signal });
          if (reply.tokenUsage?.total) reservation.cost = reply.tokenUsage.total;
          results.push({ id: current.c.id, status: 'completed', privacyPassed: true, expected: current.c.expected,
            actual: { detected: reply.isScam, type: reply.scamType ?? null, confidence: reply.confidence },
            exactMatch: reply.isScam === current.c.expected.detected && (reply.scamType ?? null) === current.c.expected.type,
            tokenUsage: reply.tokenUsage, latencyMs: reply.latencyMs,
            promptSha256: createHash('sha256').update(current.prompt).digest('hex') });
        } catch (error: any) {
          // No provider bodies, credential, original prompts or private identity maps in reports.
          results.push({ id: current.c.id, status: error?.status === 429 ? 'rate-limited' : controller.signal.aborted ? 'timeout' : 'error',
            httpStatus: error?.status, limitKind: error?.limitKind, retryAfter: error?.retryAfter });
          save(false);
          break; // No retries or unbounded usage after transport failures.
        } finally { clearTimeout(timeout); }
        save(true);
        console.info(`[privacy-smoke] ${results.length}/8 completed; total tokens ${results.reduce((s, r) => s + (r.tokenUsage?.total ?? 0), 0)}`);
      }
    } finally { spy.mockRestore(); save(false); }
    expect(results.filter(r => r.status === 'completed')).toHaveLength(8);
    expect(boundaryChecks).toBe(8);
    // A classification mismatch is reported, never disguised as a privacy failure or SAFE.
  }, 600_000);
});
