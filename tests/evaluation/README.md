# S.O.V.A. Evaluation Corpus

This directory contains versioned conversation scenarios with historical labels and a new AI-authored, independently unreviewed challenge set for evaluating the local intent-detection pipeline. It complements unit tests: unit tests check individual rules; this corpus checks end-to-end classification of realistic, multi-turn examples.

## Two evaluation tracks

The historical 326 cases are a strict regression gate, already used to tune heuristics. The new 300 challenge-v1 conversations are a reporting-only research benchmark: 120 threats, 80 safe controls, 100 ambiguous cases. Ambiguous cases are excluded from binary and exact-match rates and have separate detection/lock counters. A technical exception, missing prediction, invalid corpus or historical regression still fails CI; an exploratory disagreement does not. This makes the meaning of green CI explicit instead of disguising incomplete detection.

See [challenge methodology](CHALLENGE_V1.md). Neither track currently proves independently measured real-world accuracy. Do not relabel challenge examples to make a score green.

## Files

- `corpus/development.json` — examples used while changing rules and thresholds.
- `corpus/regressions.json` — confirmed bugs and false alarms that must not return.
- `corpus/holdout.json` — historical evaluation scenarios. The 2026-10-10 corpus-fix work explicitly inspected its remaining mismatches, so it is now a regression benchmark, not an independent final holdout. Do not claim generalization from its perfect score; collect a new unseen set before final evaluation. A corpus test still rejects exact conversation-text overlap with development or regressions. This is a process convention, not access control.
- `corpus/challenge-v1.json` — 300 new frozen conversations, AI-authored labels pending human review; never read by current model-training preparation.
- `challenge-v1.manifest.json` — annotation snapshot, baseline commit, content hash and provenance.
- `corpus.schema.json` — JSON Schema for the corpus files.
- `corpus.evaluation.test.ts` — Vitest runner. It evaluates every turn in a conversation using `ChatSessionState`, then checks the final classification strictly for the historical set and records challenge predictions without a perfect-score assertion.
- `RESULTS.md` — dated notes explaining intentional classifier/corpus changes and how to interpret their metric shifts.

The corpora contain labeled cases; check the JSON files for current counts. Add future examples to the appropriate file using the schema. IDs must be unique across all files. Keep paraphrases and variants from the same underlying scenario in the same file/split to avoid leakage.

Example case to copy into a corpus file:

```json
{
  "schemaVersion": 1,
  "cases": [{
    "id": "off-platform-phone-001",
    "tags": ["uk", "marketplace", "phone-number"],
    "messages": [
      { "speaker": "interlocutor", "text": "У мене збій у застосунку. Надішліть номер телефону, щоб продовжити розмову телефоном." }
    ],
    "expected": {
      "detected": true,
      "intentType": "OFF_PLATFORM_REDIRECT",
      "action": "WARN"
    },
    "notes": "Співрозмовник намагається перенести розмову поза захищений чат."
  }]
}
```

## Run

```sh
npm run test:corpus
```

The runner reports true positives, false positives, false negatives, true negatives, precision, recall, and F1, separately by corpus. Report schema v2 keeps top-level legacy aggregates for backward compatibility; `groups.regression` and `groups.challenge` are the authoritative separate scores. It includes all 626 predictions, no conversation text, and an ambiguity-aware `scored` field. It also prints failed case IDs. The frozen challenge size/hash is validated; an incomplete execution refuses report publication. The complete suite still runs with `npm test`.

Set `SOVA_EVAL_REPORT=metrics/evaluation.json` when running Vitest to write a machine-readable report. It contains commit/corpus hashes, aggregate metrics, category and split breakdowns, and mismatch IDs; message text is deliberately excluded. GitHub Actions stores historical metric summaries in the `metrics-history` branch and publishes a static dashboard to GitHub Pages. The dashboard has separate charts and breaks lines on corpus-hash changes. Old histories have no challenge values; they are gaps, never zeroes or copied regression scores. Summaries are historical aggregates; detailed downloadable predictions describe the latest run. The new hash canonicalizes CRLF to LF, so the first schema-v2 regression point may break from historical platform-dependent hashes.

Expected labels in this suite describe the local heuristic pipeline, before a cloud LLM verdict. The corpus runner makes no network calls and does not require an API key. Groq live integration is a separate opt-in run; see `../integration/README.md`. Never make ordinary unit or corpus runs depend on a live provider.

## Authoring rules

1. Label the intended threat category, whether the local detector should form an intent, and the user-impact action (`ALLOW`, `WARN`, or `LOCK_INPUT`). Use `null` for `intentType` when no intent should be formed. The runner verifies the action through the same policy function used by the content script.
2. Include benign and ambiguous examples with the same vocabulary as attacks (for example, phone numbers for delivery versus requests to move a marketplace chat off-platform).
3. Include complete dialogue context when the interpretation depends on earlier turns. Order messages chronologically and set `speaker` to `interlocutor` or `user`.
4. Add a regression case whenever a real false positive or missed threat is confirmed. Remove personal data and replace it with synthetic values first.
5. Record why the label is correct in `notes`; avoid copying live user conversations verbatim.
6. Keep exact and near-duplicate conversations in the same split. The automated check catches exact text overlap; review paraphrase families manually because a text-level check cannot reliably identify semantic duplicates.
7. For a small bachelor-project evaluation, target at least 300–500 scenarios overall, with benign/ambiguous cases represented generously. Do not treat many near-identical paraphrases as independent evidence.

The JSON corpus measures local classification and the mitigation policy. Browser pages under `test_pages/scenarios/` remain manual/integration smoke tests for rendering and actual input locking. Those UI outcomes still need browser verification; a correct policy result alone does not prove that the page behaved correctly.
