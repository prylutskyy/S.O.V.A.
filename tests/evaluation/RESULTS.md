# Evaluation results and change log

Record each intentional classifier or corpus change here so metric shifts can be interpreted alongside the dashboard history. Exact-match results depend on both the classifier and the corpus contents; compare runs only when the corpus hash is the same, or report the changed split separately.

## 2026-10-10 — live chat ingestion and truthful AI URL telemetry

- Excluded composers, controls and nested button labels from both local session ingestion and DOM dialogue extraction. Fixed the real otr.to send button appearing as `[Ви]: ↣` in the AI prompt; preserved actual message roles and embedded links.
- Removed the trigger-text fallback for `targetSuspiciousUrl`. The arbiter now checks URL evidence separately, preserves explicit URL path/query casing and raises URL/off-platform flags independently. The cloud prompt no longer invents an external destination when only the source platform is known.
- Added five automated regressions covering composer/button exclusion, nested action removal, masked message links, text-only AI requests and real URL telemetry. Full non-Groq run: **698/699 tests passed**, **65/66 files passed**. The sole failure remains the aggregate corpus assertion with **32 mismatches**, unchanged from the preceding run. Build and TypeScript checks passed.
- Live combined-mode check on otr.to after rebuilding and manually reloading the extension: the actual Groq prompt contained only the interlocutor's passport request, no send-button utterance and no URL warning/route. Groq `qwen/qwen3.8-27b` returned `IDENTITY_PROBING`, `isScam: true`, confidence 98, latency 515 ms. This is a single pipeline check, not a cloud accuracy estimate or an independent local-only verdict.
- Repeated the identical passport request in a fresh otr.to dialogue with cloud AI disabled by the user: local events reported `IDENTITY_PROBING`, score 45; the arbiter returned no usable response and no warning appeared. The current unavailable-AI fallback requires a local score of at least 75. This exposes a runtime warning-policy gap despite correct local detection. The sender's local threat log remained empty. A subsequent safety warning in the same conversation retriggered analysis of the existing threat context; it is not an isolated benign-message test. The user restored cloud AI after the comparison.
- Final focused rerun passed **25/25** dialogue, arbiter and sanitizer tests. A preceding parallel rerun failed to load a temporary Vite module (`ENOENT`); rerunning with one worker resolved it.
- Local logs and screenshots are stored under untracked `tests/results/`; raw chat report data is not part of this tracked summary.

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

## 2026-10-10 — speaker isolation and context recency

### Changes

- Local heuristic and semantic decisions use interlocutor messages only. Outbound messages keep their text and speaker identity in AI dialogue history, but store no threat clusters or match spans. A user quote cannot supply a seed, military or payment signal to the other person's intent.
- Outbound evaluations reuse the latest interlocutor message's original timestamp and language. Replies cannot renew its age or change its localization. Incoming and outgoing histories have independent limits of 30 messages each, so user replies cannot evict incoming evidence.
- Evidence has full weight for 60 seconds, then an exponential five-minute half-life: `2 ** (-max(0, ageMs - 60000) / 300000)`. At six minutes its weight is 0.5; at eleven minutes 0.25. Messages expire at fifteen minutes, and future timestamps after a clock reversal are discarded.
- Heuristic clusters use their maximum decayed weight rather than accumulating repeated messages. For aged semantic context, decision confidence is reduced using support for the required action, target, reward or credential cues. This prevents unweighted pragmatic flags or vector similarity from restoring old evidence. Fresh unrelated messages do not refresh old cues; old unrelated greetings do not weaken fresh threat evidence. `recencySupport` is exposed in telemetry.
- Added sixteen tests for quoted outgoing threats, mixed-speaker combinations, preserved incoming threats, split incoming lures, fading confidence, stale heuristic and semantic blocking evidence, per-speaker limits, TTL/clock reversal and reset. Replaced the old message-buffer smoke assertion with a real thirty-message retention check.

### Results

Compared with `1af9799`, all corpus metrics and scenario predictions are unchanged on the same 326 cases and SHA-256 `9319bb14b87430898ea9dc42f14cff7faa03aa37e215861612e633ab87442cde`:

| Measure | Before | After |
| --- | ---: | ---: |
| TP / FP / FN / TN | 154 / 1 / 34 / 137 | 154 / 1 / 34 / 137 |
| Binary detection F1 | 89.8% | 89.8% |
| Exact matches | 284/326 (87.1%) | 284/326 (87.1%) |
| Exact-result mismatches | 42 | 42 |
| False input locks | 0 | 0 |

The corpus has no controlled inter-message delays and little mixed-speaker coverage. Therefore it does not measure the benefit of this change. The sixteen new isolated-time tests verify those behaviors separately without modifying corpus labels or tuning against holdout text.

Full validation without live Groq: 660 passing tests and one failing aggregate corpus assertion (the same 42 mismatches). TypeScript compilation passes. Raw logs stay local under `tests/results/`.

Age is measured from extension ingestion, not from the chat platform's displayed send time. The grace period and half-life are initial policy settings, not calibrated estimates; validate them on independently labelled conversations with realistic timing. An aged local score does not itself clear an active UI threat or override an AI verdict. Full two-speaker history remains available to the cloud arbiter.

## 2026-10-10 — personal-data requests and scoped SAFE reuse

- Replaced identity keyword mentions with request/object matching within a sentence. Covered document photos and identifiers, tax identifiers, account recovery answers and birth dates in Ukrainian, Russian and English. Added request negation and explanatory/quoted-example exclusions. Ordinary delivery addresses alone are not identity evidence; vault keywords also require a request.
- Removed score-based session SAFE immunity. Only an exact-context cache entry can reuse a safe verdict, preserving the provider's original confidence and reasoning for up to five minutes. The key includes dialogue, draft, intent, URL, evidence, score and session identity; session reset invalidates reuse and late inference results.
- Evaluation now compares against commit 91803f4 on the same 326 cases and unchanged corpus hash. The first run found an omitted request verb in dev2-id-002 and an overbroad question-word match in safe2-reg-012. Added the request verb and restricted question-word proximity to the sensitive object; both regressions are corrected. Holdout text and labels were not used for tuning.

| Measure | Before | After |
| --- | ---: | ---: |
| TP / FP / FN / TN | 154 / 1 / 34 / 137 | 164 / 1 / 24 / 137 |
| Precision | 99.4% | 99.4% |
| Recall | 81.9% | 87.2% |
| Binary F1 | 89.8% | 92.9% |
| Exact matches | 284/326 | 294/326 |
| Exact-result mismatches | 42 | 32 |
| Action mismatches | 36 | 26 |
| Identity class F1 | 70.0% | 96.0% |
| False input locks | 0 | 0 |

Six development/regression identity misses and four independently evaluated holdout cases are fixed; no previously correct case regressed. Twenty-three new identity checks and ten mocked SAFE cache checks cover advice, negation, quoted examples, sentence boundaries, exact-result reuse, changed evidence/dialogue, expiry, reset and stale responses.

Final full run without live Groq: 65 passing files and one failing corpus file; 693 passing tests and one failing aggregate corpus assertion (32 remaining exact mismatches). Focused run: 37/37. TypeScript compilation passes. Final log: tests/results/vitest-identity-safe-final-2026-10-10.log; baseline: tests/results/evaluation-before-identity-safe-2026-10-10.json. Raw results remain local.
