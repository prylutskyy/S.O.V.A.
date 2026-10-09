# S.O.V.A. Evaluation Corpus

This directory contains human-labeled conversation scenarios for evaluating the local intent-detection pipeline. It complements unit tests: unit tests check individual rules; this corpus checks end-to-end classification of realistic, multi-turn examples.

## Files

- `corpus/development.json` — examples used while changing rules and thresholds.
- `corpus/regressions.json` — confirmed bugs and false alarms that must not return.
- `corpus/holdout.json` — scenarios reserved for final evaluation; do not use these to tune rules. Since this project is version controlled, this is a process convention, not access control.
- `corpus.schema.json` — JSON Schema for the corpus files.
- `corpus.evaluation.test.ts` — Vitest runner. It evaluates every turn in a conversation using `ChatSessionState`, then checks the final classification.

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

The runner reports true positives, false positives, false negatives, true negatives, precision, recall, and F1, both overall and by expected category. It also prints failed case IDs. Empty files are reported as skipped; they do not count as evaluated examples. The complete suite still runs with `npm test`.

Expected labels in this suite describe the local heuristic pipeline, before a cloud LLM verdict. The corpus runner makes no network calls and does not require an API key. Groq live integration is a separate opt-in run; see `../integration/README.md`. Never make ordinary unit or corpus runs depend on a live provider.

## Authoring rules

1. Label the intended threat category, whether the local detector should form an intent, and the user-impact action (`ALLOW`, `WARN`, or `LOCK_INPUT`). Use `null` for `intentType` when no intent should be formed. The runner verifies the action through the same policy function used by the content script.
2. Include benign and ambiguous examples with the same vocabulary as attacks (for example, phone numbers for delivery versus requests to move a marketplace chat off-platform).
3. Include complete dialogue context when the interpretation depends on earlier turns. Order messages chronologically and set `speaker` to `interlocutor` or `user`.
4. Add a regression case whenever a real false positive or missed threat is confirmed. Remove personal data and replace it with synthetic values first.
5. Record why the label is correct in `notes`; avoid copying live user conversations verbatim.
6. For a small bachelor-project evaluation, target at least 300–500 scenarios overall, with benign/ambiguous cases represented generously. Do not treat many near-identical paraphrases as independent evidence.

The JSON corpus measures local classification and the mitigation policy. Browser pages under `test_pages/scenarios/` remain manual/integration smoke tests for rendering and actual input locking. Those UI outcomes still need browser verification; a correct policy result alone does not prove that the page behaved correctly.
