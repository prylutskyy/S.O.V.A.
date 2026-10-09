# Live Groq integration tests

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
