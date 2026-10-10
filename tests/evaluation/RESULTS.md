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

## 2026-10-10 — critical threat false-negative fixes

### Changes

- Closed all eleven selected crypto/military false negatives in development/regressions: `dev2-crypto-002`, `reg-crypto-001`, `reg2-crypto-001/002/005/006`, `dev2-military-004`, and `reg2-military-003/004/005/006`. Tests assert both the expected threat type and `LOCK_INPUT` through the chat pipeline.
- Expanded explicit wallet-secret requests to cover private keys, mnemonic/backup phrases, inflected requests and mixed-script technical terms after normalization. Added negation handling, including support safety advice, without suppressing a subsequent real request.
- Added concrete military reconnaissance/destructive-action requests and English courier recruitment for military intelligence collection. Narrowed the semantic movement-schedule signal so a bus timetable alone no longer triggers a military input lock.
- Added 35 focused checks: eleven corpus regressions, five crypto paraphrases, seventeen benign controls, one advice-followed-by-request scenario and a check that all eleven target IDs are covered. All pass.
- Corpus content and labels are unchanged. Holdout wording was not used to design rules or tests.

### Results

Compared with the fresh 2026-10-10 baseline at `e05df3c`, on the same 326 cases and corpus SHA-256 `9319bb14b87430898ea9dc42f14cff7faa03aa37e215861612e633ab87442cde`:

| Measure | Before | After |
| --- | ---: | ---: |
| TP / FP / FN / TN | 139 / 1 / 49 / 137 | 151 / 1 / 37 / 137 |
| Precision | 99.3% | 99.3% |
| Recall | 73.9% | 80.3% |
| F1 | 84.8% | 88.8% |
| Exact matches | 259/326 (79.4%) | 272/326 (83.4%) |
| Exact-result mismatches | 67 | 54 |
| Action mismatches | 52 | 39 |
| False input locks | 0 | 0 |

Development recall rose from 94.9% to 98.3%; regression recall from 72.1% to 86.9%. Holdout recall rose from 57.4% to 58.8%. The corrected thirteen exact results comprise eleven targeted misses and two independently evaluated holdout improvements (one missed crypto threat and one crypto type correction). No previously correct corpus scenario became incorrect.

The final full run without live Groq has 592 passing tests and one failing aggregate corpus assertion (54 remaining mismatches); TypeScript compilation passes. Raw logs and the baseline report remain local under `tests/results/`.

These rules improve coverage of concrete requests, not contextual understanding in general. In particular, the existing label for `reg2-military-003` treats an unspecified equipment movement schedule as military reconnaissance. Industrial/logistics uses of such wording remain ambiguous and need independent benign data and label review. Zero false locks on this corpus and the added controls does not establish zero false locks in real chats.

## 2026-10-10 — verification and payment purpose resolution

### Changes

- Added independent `verification_purpose` and `payment_purpose` signals. Requests to confirm an account, login, order or card are distinguished from requests made to receive a payment; words in a URL do not establish either purpose.
- When verification, payment theft and escrow candidates compete, an explicit secret request in the current message resolves the category according to its purpose. A prior verification pretext cannot override a new payout request. Existing military/crypto candidate selection is preserved.
- Added lexical coverage for confirmation codes, Latin `SMS`, PIN, both sides of a card and bank sign-in requests. Bank sign-in requires both a link and a payout purpose to form the payment-theft class.
- The chat pipeline can veto the semantic payment fallback for clear safety advice, completed-status messages without credential subjects, and self-service balance checks. Concrete secret requests remain eligible, and other unlisted paraphrases retain semantic evaluation.
- Added 52 checks covering all 32 development/regression verification/payment cases, ten purpose/URL contrasts, nine safe controls and one stale-context check. The existing 35 critical-threat checks still pass. Corpus files, labels and SHA-256 are unchanged; no holdout text was used for tuning.

### Results

Compared with the baseline at `617ac05`, on the same 326 cases:

| Measure | Before | After |
| --- | ---: | ---: |
| TP / FP / FN / TN | 151 / 1 / 37 / 137 | 154 / 1 / 34 / 137 |
| Precision | 99.3% | 99.4% |
| Recall | 80.3% | 81.9% |
| Binary detection F1 | 88.8% | 89.8% |
| Exact matches | 272/326 (83.4%) | 284/326 (87.1%) |
| Exact-result mismatches | 54 | 42 |
| Action mismatches | 39 | 36 |
| False input locks | 0 | 0 |
| Verification class F1 | 60.0% | 87.5% |
| Payment theft class F1 | 63.0% | 81.6% |

Ten exact results were corrected in development/regressions and two in the independently evaluated holdout. No previously correct scenario became incorrect. Development binary recall stays at 98.3%; regression recall rises from 86.9% to 91.8%; holdout binary recall stays at 58.8%. Per-class F1 measures the chosen category, whereas binary detection F1 measures threat versus safe regardless of category.

Full non-Groq validation: 644 passing tests and one failing aggregate corpus assertion, with 42 remaining mismatches. TypeScript compilation passes. Logs and the baseline report stay local under `tests/results/`.

The categories still overlap: a bank code requested under an account-check pretext can support both labels. The purpose rule follows the current corpus convention and selects one primary type; it does not establish that only one attack mechanism is present. The remaining benign false positive and holdout misses still need separate work.
