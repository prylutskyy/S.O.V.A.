# Paired Groq evaluation — 2026-10-10

Model: `qwen/qwen3.8-27b`. Fixed cohort: 40 historical dialogues, 24 threat-labelled and 16 safe; six multi-turn. Both prompts use the same purpose-based taxonomy. Selection and three annotation-review flags were frozen before inference. Earlier smoke examples are excluded; this remains historical development/regression/pilot data, not blind independent validation.

| Metric | Observations | Compact |
| --- | ---: | ---: |
| Completed case/variant pairs | 40/40 | 40/40 |
| Exact matches against frozen labels | 38/40 | 39/40 |
| TP / FP / FN / TN | 22 / 0 / 2 / 16 | 23 / 0 / 1 / 16 |
| F1 against frozen labels | 95.7% | 97.9% |
| Exact matches excluding 3 pre-flagged annotations | 37/37 | 37/37 |
| Mean input tokens | 1010.675 | 760.225 |
| Completed-response p95 latency | 933 ms | 600 ms |
| Failed attempts retained | 1 HTTP 429 | 0 |

Compact reduced mean input usage **24.8%** while matching the same 37 unflagged cases. The apparent one-case accuracy gain lies in disputed annotation territory, so it is **not established as a real detection improvement**. The p95 difference describes this one API run, not a latency guarantee or statistically established speedup. Neither prompt produced a false alarm on these 16 safe controls. No real browser lock actions were executed.

## Annotation disagreements

- `dev2-off-008`: “Please contact me on Viber to arrange pickup.” Both prompts return SAFE; the historical label is OFF_PLATFORM_REDIRECT. This was pre-flagged: coordination alone does not establish deception.
- `reg2-phone-002`: ordinary coordination of order details via Signal. Observations returns SAFE; compact returns OFF_PLATFORM_REDIRECT. This case was also pre-flagged, so counting compact's match as a proven improvement would be misleading.
- `dev-offplatform-001` was the third pre-flagged example. Both prompts match its frozen label, which does not independently validate that label.

Verification and payment examples match all six expected classes per category in both prompts. The shared taxonomy distinguishes verification/support/recovery purpose from payment/refund purpose; expected labels are never included in API input. We did not run the same 40 cases without the taxonomy, so this run does not isolate the taxonomy's causal effect.

## Rate limits and completion

At 20 requests/minute the first batch completed 12 replies, then received HTTP 429 on attempt 13. This does not identify the limit's cause: request count is not the only possible quota. The run stopped. After a pause, an explicit resume at six requests/minute skipped completed pairs and finished the remaining 68 replies without another limit error. Total: **81 inference attempts, 80 successful responses**. No automatic retries or repeated successful pairs. Past failures are retained, so the strict integration health assertion remains failed even though all planned pairs completed.

Key entered through hidden stdin, held only in process memory/child environment; not saved to source, results or command arguments. All verification requests use the conservative 10000-token guard and 512-token completion cap.

## Applied changes

Compact is now the production default; observations remains available for comparison. It preserves available dialogue history while removing overlapping snapshots and redundant trigger text. If history is absent, structured cached messages retain roles/observation ages. When history exists, it uses role-labelled history and does not duplicate cached age metadata. Adapter context omissions and ambiguous sender detection are not solved by this change.

Full offline suite after promotion: **821 passed, 1 failed (822 total)**; only the pre-existing corpus assertion fails with the same 24 mismatches. TypeScript compilation and production build passed. Local classifier weights, local rule thresholds and corpus labels are unchanged.

[Machine results](groq-prompt-paired.json), [cohort and audit notes](../../training/groq-prompts/README.md), [runner instructions](../integration/README.md), [offline suite](groq-paired-suite.json).
