# Live Groq integration tests

## Compare prompt variants

The default smoke comparison evaluates four historical dialogues with neutral `observations` (previous default), `compact` (current production default), and `legacy-wrong-hypothesis` as an anchoring stress test: **12 inference requests**. Compact removes overlapping snapshots and trigger text already present in history, preserving the available earlier conversation. Without history, it uses structured session messages and observation ages. It was promoted after the 40-dialogue paired comparison: equal exact matches on all 37 unflagged cases, 24.8% fewer input tokens. This historical cohort is not a real-world accuracy guarantee. All variants use the same independent system instruction; this isolates user-prompt differences, not the entire old runtime.

Prefer `npm run test:groq:prompts:interactive`: enter the key at the hidden prompt. It is passed only in process memory/the child environment, never saved to disk or supplied as a command argument. This launcher explicitly enables only the comparison test. Alternatively use the environment-based command below.

```powershell
$env:GROQ_API_KEY = "your Groq API key"
$env:GROQ_INTEGRATION = "1"
$env:GROQ_PROMPT_COMPARE = "1"
$env:GROQ_CORPUS = "regressions"
$env:GROQ_TEST_LIMIT = "6"
npm run test:groq:prompts
```

Both enable flags are required for the direct Vitest command. The runner first checks the model list (15-second timeout), then runs the four smoke dialogues: benign support, card verification, benign manager and gradual media/military pretext. Keep `GROQ_CORPUS=regressions` for this fixed smoke sample. `GROQ_COMPARISON_MODE=full` additionally includes `text-only` and `legacy` and selects corpus/pilot cases; it requires explicitly increasing `GROQ_MAX_REQUESTS` above the default 12. Calls are sequential with at least 7000 ms between starts (about 8.6/minute); `GROQ_INTERVAL_MS` can increase this delay. Variant order rotates. Each request has `GROQ_TIMEOUT_MS` (default 30000); HTTP 429 stops further requests, without automatic retries. A single pass cannot establish a statistically reliable accuracy improvement.

### Fixed paired cohort

`GROQ_COMPARISON_MODE=paired` uses the frozen [40-dialogue cohort](../../training/groq-prompts/cohort-v1.json): six cases each for verification, payment, military recruitment and off-platform redirection, plus 16 safe controls. Six dialogues are multi-turn. Three historical off-platform labels are explicitly flagged for independent review: coordination alone does not prove an active scam. Source labels remain unchanged; report them separately rather than forcing the model to match doubtful annotations. Previous smoke IDs are excluded, but these historical development/regression/pilot cases still are not a blind test set.

Both paired prompts receive the same [purpose-based class definitions](../../src/ai/cloud/threat-taxonomy.ts). Verification/support/account-recovery purpose takes precedence over generic payment-secret theft; an actual payment/refund purpose without verification is payment theft. This is general taxonomy, not a per-case expected answer. Independent human review of the definitions and corpus remains desirable.

```powershell
$env:GROQ_COMPARISON_MODE = "paired"
$env:GROQ_MAX_REQUESTS = "80"
$env:GROQ_INTERVAL_MS = "10000"
npm run test:groq:prompts:interactive
```

The account limits supplied on 2026-10-10 for Qwen and GPT-OSS 20B/120B are 30 requests/minute, 1000 requests/day, 8000 tokens/minute and 200000 tokens/day. These are account-specific limits, not the public developer-plan quotas. Input and output both consume the token budget; switching among these three models does not increase the stated quotas.

Paired runs permit intervals down to 3000 ms (20/minute), but that pace can exceed the token quota. Default remains 7000 ms; explicitly use 10000 ms (6/minute) for this cohort and monitor actual usage for longer contexts. Compact prompts averaged about 760 input tokens in the recorded run; with the 512-token completion allowance, six such requests reserve about 7632 tokens. This is a planning estimate, not a guarantee for every dialogue. A real 3000 ms attempt hit HTTP 429 after 12 successful replies; the supplied token limits make token pressure a plausible explanation, without establishing the exact cause of that historical response. After respecting cooldown, `GROQ_RESUME=1` explicitly resumes the same model/cohort, skips completed case/variant pairs and preserves past failures. The cap applies to **all recorded attempts**, including failures: set 81 to finish 80 successful pairs after one failed attempt. No automatic retry is performed. An interrupted report is checkpointed after each attempt; final report is `tests/results/groq-prompt-paired.json`. Historical errors remain visible and keep the strict integration health assertion red even if all pairs eventually complete.

Groq verification reserves at most 512 completion tokens and conservatively rejects oversized input before networking: UTF-8 content bytes plus completion allowance and 256 framing tokens must fit within 10000. This byte bound intentionally overestimates text tokens; it is not an exact tokenizer. Actual API input/output/total usage is recorded when available. Oversized context triggers verification failure and the existing fallback instead of silently dropping important messages.

The report is saved to `tests/results/groq-prompt-comparison.json`: detection confusion matrices, F1, exact type matches, completion coverage, error/timeout counts, p95 latency and per-case outcomes. Failed requests are never counted as SAFE. `excessLockCandidates` is a diagnostic proxy for high-confidence critical classifications on safe examples, not actual browser blocking. The report contains no dialogue text, prompt, raw reply or API key. Existing test corpora are historical and are not a blind holdout. Ambiguous pilot endpoints are excluded from binary accuracy because they have no safe/threat label.

Without an environment key, no live comparison is performed. Mock tests check prompt structure, role/secret handling, strict Groq parsing and dispatcher fallback; they do not measure a real model's accuracy.

## Production verdict contract

Both runners now prepare dialogues with the production sanitizer and prompt builder. Each scenario has one shared pseudonym map for history and latest-message fields. Historical metrics predate the expanded privacy policy; do not treat them as measurements of the new prompts. See [privacy pipeline](../../docs/PRIVACY_PIPELINE.md) and [offline privacy report](../results/PRIVACY_REPORT.md). Live runs remain explicitly opt-in.

Groq must return `isScam` as a boolean, finite `confidence` in 0–100, a known `scamType`, and nonempty `reasoning`. Missing/malformed fields and unknown class aliases fail verification instead of becoming SAFE or a guessed military class. `UNKNOWN` cannot represent a confirmed attack; use `SUSPICIOUS_LURE` for attacks outside the specific classes. The dispatcher returns no cloud verdict on failure, so the existing browser-AI/local fallback applies. This strict validation currently covers the Groq driver; other provider adapters have their own parsers.

These tests send synthetic corpus messages to the real Groq API through the production `GroqDriver`. They verify the configured model/API path, the response contract, and detection metrics. They are separate from unit tests and the local corpus runner. Do not put real conversations, personal information, credentials, or secrets in the corpus.

## Run in PowerShell

```powershell
$env:GROQ_API_KEY = "your Groq API key"
$env:GROQ_INTEGRATION = "1"
npm run test:groq
```

The default run evaluates up to 12 evenly spaced cases from `holdout.json`, serially, using `qwen/qwen3.8-27b`. Calls use the user's Groq account and may incur charges or consume rate limits. Keep the key in the environment; do not commit it or place it in a test file.

## Options

- `GROQ_MODEL` — model ID; defaults to `qwen/qwen3.8-27b`.
- `GROQ_CORPUS` — `development`, `regressions`, or `holdout`; defaults to `holdout`.
- `GROQ_TEST_LIMIT` — maximum number of cases; defaults to `12`; set to `0` to run the selected corpus in full.
- `GROQ_TIMEOUT_MS` — per-request timeout; defaults to `30000`.
- `GROQ_CHECK_MODEL=1` — first query Groq's model listing and require an exact model ID match.
- `GROQ_MIN_ACCURACY` — optional threshold from `0` to `1`; without it, results are reported but accuracy does not fail the run.
- `GROQ_MAX_REQUESTS` — hard inference-request cap, defaults to 12 for both runners; must be explicitly raised for larger runs.
- `GROQ_INTERVAL_MS` — minimum interval between request starts; comparison supports at least 3000 ms, basic corpus runner at least 7000 ms. Default 7000 ms.

For example, to check whether Groq currently lists the configured model and run 20 holdout cases:

```powershell
$env:GROQ_API_KEY = "your Groq API key"
$env:GROQ_INTEGRATION = "1"
$env:GROQ_CHECK_MODEL = "1"
$env:GROQ_TEST_LIMIT = "20"
$env:GROQ_MIN_ACCURACY = "0.75"
npm run test:groq
```

The test prints a confusion matrix, accuracy, per-case IDs, confidence, and latency. Raw model responses are not persisted. Use the same pinned model and corpus when comparing runs; model output can vary. A live model result is an evaluation signal, not proof that the system is safe or suitable for blocking by itself.

Without `GROQ_INTEGRATION=1`, Vitest skips the live test and makes no network requests. If the flag is enabled but `GROQ_API_KEY` is missing, the test fails with a clear setup message.
