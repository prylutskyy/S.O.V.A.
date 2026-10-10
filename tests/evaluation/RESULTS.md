# Evaluation results and change log

Record each intentional classifier or corpus change here so metric shifts can be interpreted alongside the dashboard history. Exact-match results depend on both the classifier and the corpus contents; compare runs only when the corpus hash is the same, or report the changed split separately.

## 2026-10-10 — pooled local badges and live privacy smoke

- Local block results unchanged: regression 326/326; challenge defined cases F1 80%, exact 117/200. Added combined counts, not average F1: TP 277, FP 15, FN 30, TN 204; scored 526, F1 92.5%, recall 90.2%, exact 443/526 (84.2%). The 100 ambiguous cases and all live Groq results are excluded from combined scores.
- Eight synthetic production-prompt privacy calls completed: 8 outbound bodies checked, 8/8 binary decisions, 7/8 exact classes; 7,436 total tokens, no 429/retries. Payment versus verification mismatch retained. No raw control or general accuracy claim; source [report](../results/GROQ_PRIVACY_SMOKE_REPORT.md).
- Fixed address marker renumbering across repeat sanitize/final builder before sending any requests. Added privacy preflight and repeat-marker controls, plus pooled-score badge tests. Full offline suite **911/911**, 79 files; TypeScript and production build passed. Live integration transport/privacy test passed separately; this does not assert all class predictions are correct.
- README shows two named corpus rows and pooled top badges. Dashboard/CI display the dated manual privacy snapshot separately, never as a new API call during CI.

## 2026-10-10 — frozen challenge-v1, separate reporting tracks

- Known regression set: 326/326, F1 100%; used for tuning, no independent generalization claim.
- New AI-authored corpus: 300 nine-turn dialogues, 20 related contrast families, 120 threats + 80 safe + 100 ambiguous; labels/hash frozen before first run, independent review pending.
- Defined 200: TP 90, FP 15, FN 30, TN 65; precision 85.7%, recall 75%, F1 80%, exact 117/200 (58.5%), 83 mismatches, 58 action mismatches, 16 false locks. Ambiguous 100 excluded from these rates: 14 detected, 6 locked, not proven SAFE.
- Runtime heuristics, model weights and historical labels unchanged. Current model training excludes challenge-v1. New mismatch observations are reporting-only; historical strict assertion remains. Technical/structural failures still fail CI.
- Offline suite: 899/899, 78 files; TypeScript and dashboard/Summary generation passed. No live Groq requests; no claim of completed remote CI deployment.
- [Method and provenance](CHALLENGE_V1.md), [baseline report](../results/TWO_CORPUS_BASELINE.md), [all predictions](../results/two-corpus-baseline.json).

## 2026-10-10 — remaining local corpus mismatches resolved

- Before: 302/326 exact, FP 1, FN 19, F1 94.4%. New logic against the same old labels: 324/326 exact, FP 0, FN 1, F1 99.7%. Two audited labels then yield 326/326, FP/FN 0, F1 100%; corpus SHA changed, so distinguish algorithm gains from annotation changes.
- Improved concrete request binding, local negation scope, verification/payment/document priority, transaction redirects and protected-object military requests. Added 25 threat/control checks; no scenario-ID branching or relaxed corpus assertion.
- `hold-verify-003` is payout credential theft, still WARN. `hold2-military-002` lacks enough context for a military LOCK_INPUT; local abstention is not proof of safety and future cloud routing remains necessary.
- Full offline run using the evaluate command: **888/888 passed**. Compilation/build passed, live Groq disabled. Offline-training test timeouts are now 30 seconds; runtime performance assertions remain unchanged.
- Retrained only the existing shadow model on the same 171 train examples after feature extraction changed. Historical holdout was inspected and tuned against; it is now explicitly a regression benchmark, not an unseen final test.
- [Detailed audit and results](../results/CORPUS_FIXES_REPORT.md), [machine corpus result](../results/corpus-final-fixes.json), [model evaluation](../../training/local-intent/REPORT.md).

## 2026-10-10 — shared taxonomy, 40-dialogue paired Groq comparison and compact promotion

- Frozen 40 historical dialogues before inference: 6 verification, 6 payment, 6 military recruitment, 6 off-platform, 16 safe controls; 6 multi-turn. Previous smoke IDs excluded. Three off-platform labels were pre-flagged for independent review; source expectations remain unchanged. See [cohort notes](../../training/groq-prompts/README.md).
- Both prompts receive the same general purpose-based class definitions, not a local per-case hypothesis. All 6 verification and 6 payment cases match their frozen types in both variants. There was no same-cohort no-taxonomy control, so this does not isolate a causal taxonomy gain.
- Full frozen-label exact match: observations **38/40**, compact **39/40**; binary F1 **95.7% vs 97.9%**, FP **0/16 safe** in both. All disagreements are inside the pre-flagged off-platform annotations. Without those 3, both match **37/37**. Do not claim a proven accuracy gain by matching a doubtful label.
- Mean input tokens **1010.675 → 760.225 (−24.8%)**; completed-response p95 **933 → 600 ms** for this API run. This is not a general latency guarantee. Compact is promoted to the production default for smaller context with equal outcomes on the unflagged subset. Observations stays available as a comparison variant. Available history is retained; overlapping snapshots are removed, and observation ages are available in structured fallback when history is absent.
- At 20 requests/minute, API returned HTTP 429 after 12 successful replies. Stopped, then explicitly resumed after a pause at 6/minute, skipping completed pairs. **81 attempts, 80 completed responses**, with the past failed attempt retained. Strict integration health assertion remains failed due to that historical transport error, not missing scenario responses. Request-count quota alone did not prevent 429; actual cause was not established.
- Saved [paired report](../results/GROQ_PAIRED_REPORT.md) and `tests/results/groq-prompt-paired.json`, with an additional sensitivity summary excluding pre-flagged annotations. API key entered only via hidden stdin/process environment, never saved in code or results. No automatic retries, no repetition of successful pairs, no browser lock actions executed.
- Full offline suite after promotion: **821 passed, 1 failed (822 total)** with the same **24 local corpus mismatches**. TypeScript and production build passed. Local classifier weights/thresholds and local corpus labels unchanged. Offline log: `tests/results/groq-paired-suite.json`.

## 2026-10-10 — real Groq smoke comparison and bounded requests

- Confirmed `qwen/qwen3.8-27b` using the real model-list API. Ran exactly **12 inference attempts** on four historical synthetic dialogues with at least 7 seconds between starts; no HTTP 429 and no automatic retries. Credential supplied through hidden stdin, never saved in source, reports or command arguments. Added a reusable hidden-input test launcher.
- Current observations and experimental compact both completed **4/4**, detected both attacks, rejected both safe cases and matched exact types **3/4**. Mean input usage **770.5 → 490 tokens (−36.4%)**. Maximum completed latency **562 → 542 ms** on this tiny sample, not a statistically established speed gain. All completed responses used fewer than 1300 total input/output tokens.
- Legacy with a deliberately incorrect hypothesis completed **3/4**, with one 30-second timeout. The integration assertion failed because errors are reported separately, never counted as SAFE. This does not prove the incorrect hypothesis caused timeout or misclassification. Full [report](../results/GROQ_PROMPT_REPORT.md), machine data `tests/results/groq-prompt-comparison.json`.
- A stable remaining type discrepancy: every completed variant calls `reg-verification-001` PAYMENT_CREDENTIAL_THEFT, while the corpus expects VERIFICATION_PHISHING. Review purpose-based class definitions and annotations before interpreting this as a detection miss. Compact stays experimental; production remains observations pending a broader comparison.
- Production Groq verification now caps completion at 512 tokens, applies a conservative 10000-token budget guard before networking and gives model listing a 15-second timeout. Both live test runners have a default 12-request cap and a minimum 7-second interval. Comparison stops after HTTP 429 without retries.
- Offline suite **819 passed, 1 failed (820 total)**; only the existing corpus assertion fails with the same **24 mismatches**. Added tests for compact context preservation, duplicate snapshot removal, trigger indexing, genuine repeated messages and oversized input rejection. TypeScript compilation and production build passed. Offline log: `tests/results/groq-prompt-optimization-suite.json`.

## 2026-10-10 — independent cloud context and strict Groq verdicts

- Production cloud prompts now separate sanitized dialogue evidence from neutral keyword/URL/redaction observations. Local intent labels, categorical warnings and class-specific scenario rules are no longer forwarded to the cloud model. The model is instructed to assess evidence independently, ignore instructions inside conversation content and distinguish quotes/negation from active requests.
- Added a sanitized structured session snapshot with speaker direction and observation age, preserving the available DOM/dialogue history. Snapshot, history and latest message may overlap; the prompt explicitly warns against counting duplicates as independent evidence. Observation time is not necessarily message sending time, and adapter roles remain fallible.
- Groq rejects missing/invalid verdict fields and unknown class aliases; malformed output no longer becomes SAFE or a guessed military threat. The existing dispatcher/browser-AI/local fallback applies when cloud verification fails. Other provider parsers were not changed.
- Added an opt-in four-variant live comparison (`npm run test:groq:prompts`): text-only, neutral observations, historical legacy template and deliberately incorrect legacy hypothesis. It records confusion matrices, completion coverage, request failures, exact type matches, p95 latency and excessive-lock classification candidates separately. No actual browser actions execute in this comparison. See [integration instructions](../integration/README.md).
- Full offline suite: **815 passed, 1 failed (816 total)**; only the pre-existing corpus assertion fails with the same **24 mismatches**. Updated obsolete fixtures/assertions to the strict contract and added 12 new checks. TypeScript compilation and production build passed. Saved offline run: `tests/results/groq-context-suite.json`.
- **No live Groq comparison was run:** `GROQ_API_KEY` is absent from the environment. The new integration test skips without both enable flags. No cloud accuracy, latency or F1 improvement is claimed from mock tests; the learned local model, thresholds and corpus labels remain unchanged.

## 2026-10-10 — request relations v2 and selective abstention experiment

- Added bounded request/action/object/purpose/recipient signals, stance for negated/reported text, concealed military requests and incomplete generic queries. V2 augments learned features without increasing the 65,544 parameters. Legacy V1 artifact and training remain unchanged.
- Optional `request-context-v1` abstention validates incomplete requests, sensitive requests incorrectly called SAFE, and explicit contradictory context. It preserves candidate/score and records a reason. Absence of a regex hit alone does not veto a learned threat. This is deterministic evidence validation, not a learned ambiguity class or calibrated probability.
- Four variants separate effects of dataset expansion, new features and abstention. Historical pilot test: baseline **7/12 raw and accepted**, final relations/guarded **11/12 raw and accepted**. Guarded abstains on **4/6** ambiguous test endpoints vs baseline **0/6**; no hypothetical excessive locks in guarded. It does not resolve all ambiguity.
- Coverage tradeoff prevents promotion: old development/regressions/holdout correct accepted decisions for baseline are **97/100, 107/113, 88/113**; guarded gives **89/100, 96/113, 83/113**. Raw guarded exact types are **98/100, 108/113, 94/113**. Accepted false positives remain zero on these corpora, but refusals increase; this is not a global accuracy gain. The production rules and runtime model are unchanged.
- Added 24 author-developed diagnostic cases (8 safe, 8 ambiguous, 8 threats), excluded from SGD. Guarded achieves **16/16** known diagnostic types/accepted answers and **8/8** ambiguous abstentions, with no hypothetical excessive locks. These are development checks, not independent validation; the already-inspected pilot is historical too. See [description](../../training/local-intent/RELATIONS_README.md), [report](../../training/local-intent/RELATIONS_REPORT.md) and `tests/results/request-relations.json`.
- Added **24 tests** for relation scope, negation, quotation boundaries, nominal objects, own-account checks, military links, selective abstention, corrupt version pairing and bounded input. Full non-Groq suite: **803 passed, 1 failed (804 total)** with the same 24 baseline corpus mismatches. TypeScript and production build passed. Full suite: `tests/results/request-relations-suite.json`.
- CPU-only warm benchmark: guarded p95 approximately **1.96 ms**, maximum **2.93 ms**, no timeouts; inference process with four models peaks around **80 MiB**. This is not a whole-browser measurement or certification on old i3 hardware. No Groq calls were made.

## 2026-10-10 — authority-pretext social engineering pilot

- Added 90 synthetic author-reviewed contrast scenarios: manager, official institution and media, 30 per topic; 30 families with safe/ambiguous/threat endings and expectations after every inbound message. Family-disjoint split: 54 train / 18 validation / 18 test. Independent human label review remains pending.
- Added 54 known pilot train targets, including deduplicated benign prefixes, to the original 171 training records. Ambiguous endpoints are never SAFE training targets. Original train/validation split, features, 65,544 parameters, seed, epochs and thresholds are unchanged. Candidate is saved separately in `.cache`; runtime model hash is unchanged.
- New validation known terminal types: **10/12 → 11/12**; new test: **7/12 → 10/12** raw candidates, but **7/12 → 7/12** correct accepted decisions. Four confidently false SAFE test answers become ABSTAIN. All six ambiguous test endpoints still receive confident SAFE; ambiguity is excluded from known-label accuracy, reported separately, and remains unresolved.
- No false positives on pilot safe endpoints or benign prefixes. Historical model holdout exact match remains **94/113** with two raw-type fixes and two regressions. Original 40-example validation remains **35/40**. No production protection improvement is claimed; the candidate is not promoted. Detailed data and limitations: [pilot description](../../training/local-intent/PILOT_README.md), [report](../../training/local-intent/PILOT_REPORT.md), `tests/results/social-engineering-pilot.json`.
- Added 10 tests: contrasts/splits, annotation validation, chronology, frozen original dataset, prefix deduplication, no future/outgoing evidence, runtime time-window parity, separate model training and ambiguity/action diagnostics. Focused model suites: **27/27 passed**. Full non-Groq suite: **779 passed, 1 failed (780 total)**, retaining the same 24 baseline corpus mismatches. TypeScript and production build passed. Full suite log: `tests/results/social-pilot-suite.json`.
- CPU measurement uses a separate inference process with both models, excludes training, and remains below 500 ms per tested input; Node process peak is approximately 71 MiB, not whole-extension Chrome memory. Two pilot families deliberately exceed the 60-second context window; this does not implement long-term trust tracking.

## 2026-10-10 — learned linear classifier, shadow comparison

- Controlled size experiment added: 8192/16384/32768 hashed features, 65,544/131,080/262,152 parameters; same dataset, split, seed, epochs and thresholds. All sizes achieve 35/40 validation and 94/113 historical holdout exact type. Validation detection false negatives: 3/3/4; false positives: 0/0/0. Confidence coverage: 90%/87.5%/87.5%. Runtime artifact remains unchanged at 8192. See [size comparison](../../training/local-intent/SIZE_COMPARISON.md); separate CPU inference processes measure cold prediction, 600 warm inputs and process peak RSS without training memory.
- Size experiment verification: **17/17 focused tests passed**, including six added checks for size-specific training/inference, identical 8192 artifact, shared hashing, unsupported sizes and abstention metrics. Full non-Groq suite: **769 passed, 1 failed (770 total)**; the aggregate corpus assertion retains the same 24 baseline mismatches. TypeScript and production build passed. Suite log: `tests/results/linear-size-suite.json`.

- Added reproducible training from development/regressions only: 171 training examples and 40 group-separated validation examples; two outbound-only safe scenarios are excluded from model training. Eight classes, 65,544 learned parameters, int16 artifact about 176 KB. No holdout tuning.
- Runtime records a separate shadow prediction for up to four inbound messages not older than 60 seconds. It has no mitigation authority; rules, scores and actions remain unchanged. Added 11 tests for training provenance, group separation, bounded input, abstention, invalid artifacts, outgoing evidence, cache/reset, expiry and forced disagreement with rules.
- Historical holdout exact type: rules **89/113**, raw linear candidate **94/113** (9 fixes, 4 regressions). Validation: rules **40/40**, model **35/40**. This is evidence to retain shadow mode, not to replace rules. Full per-class metrics and abstention coverage are in [the comparison report](../../training/local-intent/REPORT.md).
- Full non-Groq suite with isolated thread workers and workspace-local TEMP/TMP: **763 passed, 1 failed (764 total)**. The remaining aggregate corpus assertion reports **24 mismatches**, unchanged from the preceding classifier baseline. No new system-test failures. This isolation also avoids the three unrelated failures observed in the previous shared-state run.
- TypeScript check and production build passed. CPU benchmark and peak Node process RSS are recorded in the comparison report; whole-extension Chrome memory and older target CPU budgets remain unverified. No live Groq requests were made.

## 2026-10-10 — structured AI checks and explicit live review

- Replaced the expanded AI log dump with a selected-check inspector, three collapsed detail sections and compact history. The model verdict/confidence is separate from the current conversation's applied protection. Current conversation is the default scope; older conversations require explicit selection. Selecting history pins a record until the user follows the latest again.
- Added a bounded 150-check diagnostic history with unique IDs, conversation IDs, original start time, completion time, measured duration and explicit pending/completed/cancelled/timeout/error states. Cancellation, obsolete session callbacks, deadline expiry, missing results and transport exceptions terminate the matching check. Terminal records reject late overwrites. Identical in-flight requests share one check; cache reuse references its original check, and session quarantine is labeled as policy reuse.
- Cloud drivers return the actual successful request text messages; native browser AI records the prompt and system instructions from the successful session-creation path. Background forwards this text-only metadata. API keys and authorization headers are excluded. Prepared dispatcher prompts are labeled as such when actual provider messages were not recorded. Cache does not claim a new model call or repeat the original inference latency as cache timing.
- AI and event views now have explicit live/pause controls. Pause freezes displayed checks, events and protection without stopping analysis. Incoming updates are signaled; text selection defers replacement, and details, focus, search caret and reading position survive updates. Repeated ordinary event steps append chronologically; check start/completion entries link to the inspector. Event scrolling follows the end only while the reader is already there and is not searching. Clear also resets stale view filters.
- Added **28 regression cases** across `ai-inspector.test.ts` and `request-diagnostics.test.ts`. Full unit run: **658/658 passed in 63 files**. After adding the final two text-selection/search-caret cases and resetting stale clear filters, the final affected UI/content run passed **88/88 in 9 files**. TypeScript and production build passed. Local logs: untracked `tests/results/vitest-ai-inspector-unit-2026-10-10.log` and `vitest-ai-inspector-ui-content-2026-10-10.log`.
- Visual review used static snapshots of the real renderers with synthetic data, including normal, narrow, expanded and paused inspector states. No live Groq call or reloaded-extension live test was performed. Classification rules/corpus were not reevaluated; these UI/diagnostic changes do not establish a new classification metric. Documentation: `docs/DESIGN_SYSTEM.md`, implementation specification section 10.4.

## 2026-10-10 — shared visual language and truthful spectrum state

- Replaced the duplicated TypeScript palette with the canonical `design-tokens.css` imported through `?inline`. Popup, debugger, modals, banners and field/chat capsules now share typography, readable semantic colors, surface styles, radii, shadows, keyboard focus and reduced-motion rules.
- Reworked the spectrum into the debugger's common card layout: one vertical scroll area, responsive summary, neutral prototype controls, numbered chart dimensions and a horizontally scrollable plot. Removed the misleading cosine-similarity threshold line from the per-dimension weight chart. Similarity is explicitly distinguished from the applied protection action.
- Without actual telemetry, the spectrum now shows an empty state instead of a sample attack. Incoming events preserve focus and reading position in the current tab; popup module descriptions wrap instead of being truncated.
- Focused verification: **66/66 tests passed in 8 files**, covering UI suites and the actual content-runtime threat-arbitration suite. TypeScript and production build passed. An earlier parallel run failed to load temporary Vite modules; the sequential single-worker thread run succeeded. Local log: untracked `tests/results/vitest-design-language-2026-10-10.log`.
- Browser visual review used static snapshots of the actual renderers with synthetic data, including a 340px-wide spectrum, popup tabs, event/AI views and the empty spectrum. These snapshots do not exercise real Groq or extension settings. Visual artifacts are local under untracked `tests/results/`.
- Detection rules, mitigation thresholds and corpus labels were unchanged. No new corpus or live Groq evaluation was run, so this UI change does not establish any classification metric improvement. Design guidance is recorded in `docs/DESIGN_SYSTEM.md` and section 10 of the implementation specification.

## 2026-10-10 — diagnostic status follows the applied threat action

- Fixed the overview showing “safe” while a real warning/lock was active. Content now records the applied action, intent, score and decision source explicitly; overview and exported JSON use this state before draft mitigation or inferred log verdicts.
- Cancelling a draft does not clear an active conversation threat. Background echoes in the same session preserve the concrete local score (e.g. 45) instead of replacing it with severity-derived 75. SAFE/context/navigation reset removes the decision.
- Added 2 overlay regressions and extended real content-runtime assertions for the local warning, critical input lock and SAFE reset. **42/42 focused tests passed** across overlay, content runtime, banner and latency suites. TypeScript and production build passed.
- Subsequent live check on otr.to after the user reloaded this build: with Groq disabled and no usable arbiter verdict, the passport request displayed `ACTIVE_WARNING`, `IDENTITY_PROBING`, local score 45; typing was allowed and clearing the draft preserved the warning and score. A fresh wallet-secret request displayed `INPUT_LOCKED`, `CRYPTO_WALLET_COMPROMISE`, local score 85; a normal key and Enter were blocked. Explicit reset cleared the banner/decision to safe score 0 and restored keyboard input. The outgoing sender remained safe without an AI request. Groq was restored by the user afterward. This verifies local runtime/UI behavior on one site, not cloud accuracy, time-decay behavior or all input/send paths. Detailed evidence: untracked `tests/results/otr-debugger-live-2026-10-10.md` and three screenshots.
- Classification thresholds/corpus were not changed; the previous full evaluation's 32 mismatches are not reevaluated by this focused run. Log: untracked `tests/results/vitest-debugger-status-2026-10-10.log`.

## 2026-10-10 — runtime warnings without AI and end-to-end mitigation checks

- Fixed the runtime gap observed on otr.to: a formed advisory intent such as `IDENTITY_PROBING` now produces a real warning with local score 45 when the arbiter is unavailable. This does not change classifier thresholds. Ordinary warnings leave typing enabled; critical military/crypto input locks still require local score >=75 in fallback mode. Weak critical signals below that threshold remain suppressed without AI confirmation; weak unknown signals remain suppressed as well.
- Unified fallback for unavailable AI, transport exceptions, rejected arbitration and inconclusive SAFE (<50). A convincing SAFE still removes the banner and restores input.
- Added a 15-second arbiter deadline. Completion, cancellation and timeout clean up the timer/listener. Late callbacks after timeout cannot update the exact cache, session verdict or UI. Conversation changes cancel the pending request.
- Added **10 content-runtime tests** using the actual content-script entrypoint, MutationObserver, local classifier, arbiter and real banner/input protection, with a controlled AI transport and unrelated scanners disabled. Covered score-45 identity warnings, AI confirmation, SAFE restoring previously blocked input, inconclusive SAFE, transport failure, rejected arbitration, timeout/late SAFE, navigation isolation, strong crypto input blocking and benign/outgoing messages. Added **2 fallback policy boundary tests**.
- Focused checks: **32/32 passed** across content, mitigation, arbiter and latency suites; the final strengthened SAFE/input-restoration check passed with **10/10** content tests. Full non-Groq run: **710/711 passed**, **66/67 files passed**. Its only failure remains **32 corpus mismatches**, unchanged from the previous run. Build and TypeScript checks passed.
- This change corrects runtime mitigation; it does not improve corpus classification metrics. The new behavior was verified through automated DOM/runtime tests, not a new live otr.to run. Rebuilt output is available under `.output/chrome-mv3` and requires a manual extension reload for live verification.
- Subsequent live verification after the user rebuilt/reloaded: Groq was disabled; both threat checks had no usable arbiter response, including no Gemini Nano verdict. On otr.to the score-45 passport request produced a real warning, ordinary keys were accepted and a reply was delivered; a standalone benign caution produced no warning/AI request. In a separate fresh dialogue a score-85 wallet-secret request produced a critical banner, blocked a normal key and prevented Enter from sending. The automation text-insertion API could place a generic draft into the guarded field, so this is evidence for keyboard/Enter guards, not every possible input/send path. The diagnostic overview still incorrectly displayed a safe status during the alert. Groq was restored afterward. Evidence and detailed limitations are in untracked `tests/results/otr-runtime-fallback-live-2026-10-10.md` and screenshots.
- Logs: untracked `tests/results/vitest-runtime-fallback-full-2026-10-10.log` and `tests/results/vitest-runtime-fallback-content-final-2026-10-10.log`.

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
