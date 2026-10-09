# Evaluation results and change log

Record each intentional classifier or corpus change here so metric shifts can be interpreted alongside the dashboard history. Exact-match results depend on both the classifier and the corpus contents; compare runs only when the corpus hash is the same, or report the changed split separately.

## 2026-10-09 — messenger normalization and independent holdout

Commit: `bdce148` (`fix: detect normalized off-platform messenger requests`).

### Changes

- The text normalizer folds Latin homoglyphs into Cyrillic characters. Messenger names such as Telegram, Signal, and WhatsApp could therefore become mixed-script forms the off-platform dictionary did not recognize. Added coverage for those normalized forms, plus common Ukrainian redirect actions.
- Added common Russian words to the language detector so short mixed-script requests are more often evaluated with the Russian rule set.
- Replaced 49 holdout examples whose exact conversation text also appeared in development or regressions. Labels and actions were preserved while the messages were rewritten as independent scenarios.
- Added an automated check that rejects exact conversation text shared between holdout and the tuning splits.

### Results

| Measure | Before | After |
| --- | ---: | ---: |
| Corpus scenarios | 326 | 326 |
| Exact matches | 234 (71.8%) | 251 (77.0%) |
| Precision | 100.0% | 99.2% |
| Recall | 59.0% | 68.1% |
| F1 | 74.2% | 80.8% |
| False `LOCK_INPUT` actions | 0 | 0 |
| Exact holdout overlaps with tuning splits | 49 | 0 |

The old and new overall figures are **not a clean apples-to-apples comparison**: the classifier changed and 49 holdout messages were replaced. The expected labels and scenario count were preserved, but the new holdout now measures generalization on independent wording.

On the unchanged development and regression splits, binary detection improved:

| Split | Recall before | Recall after | Exact matches after |
| --- | ---: | ---: | ---: |
| Development (100 cases) | 74.6% | 93.2% | 94/100 |
| Regressions (113 cases) | 50.8% | 60.7% | 86/113 |

The remaining exact holdout result is 71/113 (62.8%). The corpus run still fails its aggregate exact-result assertion: 75 scenarios have a detection, threat-type, or action mismatch. There is one benign holdout false positive and no false input locks. Do not tune rules against these holdout cases; review them only as final evaluation evidence.

The 2026-10-09 post-change corpus hash is `9319bb14b87430898ea9dc42f14cff7faa03aa37e215861612e633ab87442cde`. The machine-readable local report is written to `metrics/evaluation.json` when the corpus test runs with `SOVA_EVAL_REPORT=metrics/evaluation.json`.

## 2026-10-09 — escrow delivery false-negative fixes

### Changes

- Expanded Ukrainian and English payout/payment-claim patterns used by `ESCROW_DELIVERY_SCAM`, including claims about receiving a payment, confirming a payout, collecting funds, and prepaid delivery.
- Added recognition for `https` links whose Latin `p` was converted to Cyrillic `р` by homoglyph normalization. This fixed cases where a suspicious external payment link disappeared from the classifier's URL signal.
- Added seven targeted positive unit examples for delivery/payment lures and three safe delivery/payment controls.
- Kept the holdout split out of tuning; its five escrow misses remain evaluation findings, not rule-tuning examples.

### Results

The corpus hash is unchanged from the previous entry, so these overall figures are directly comparable:

| Measure | Before escrow fixes | After escrow fixes |
| --- | ---: | ---: |
| Corpus scenarios | 326 | 326 |
| Exact matches | 251 (77.0%) | 259 (79.4%) |
| Precision | 99.2% | 99.3% |
| Recall | 68.1% | 73.9% |
| F1 | 80.8% | 84.8% |
| False `LOCK_INPUT` actions | 0 | 0 |
| Exact-result mismatches | 75 | 67 |

All seven targeted development/regression escrow examples now pass. The corpus evaluation still fails its aggregate exact-result assertion because 67 scenarios have a detection, threat-type, or action mismatch. The single benign false positive remains `hold2-benign-007`; five escrow misses remain in holdout. The full non-Groq test run had 554 passing tests and this one failing aggregate corpus assertion. TypeScript compilation and the focused intent-classifier suite (48/48) pass. Local Vitest logs are kept under `tests/results/` and are not part of the tracked evaluation record.
