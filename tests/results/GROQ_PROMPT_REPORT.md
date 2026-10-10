# Groq prompt smoke comparison — 2026-10-10

Historical first smoke run. Compact was subsequently promoted after the [40-dialogue paired comparison](GROQ_PAIRED_REPORT.md); the observations below describe its earlier experimental state.

Model: `qwen/qwen3.8-27b`, confirmed via the real model list. Four historical synthetic dialogues × three variants = **12 inference attempts**. At least 7 seconds between starts, no automatic retries, no HTTP 429. All completed responses used fewer than 1300 total input/output tokens. Credentials were supplied through hidden stdin and held only in process memory/environment, not files or command arguments.

| Variant | Completed | Detection correct | Exact type correct | Mean input tokens | Maximum completed latency |
| --- | ---: | ---: | ---: | ---: | ---: |
| Current neutral observations | 4/4 | 4/4 | 3/4 | 770.5 | 562 ms |
| Experimental compact | 4/4 | 4/4 | 3/4 | 490 | 542 ms |
| Legacy with wrong local hypothesis | 3/4 | 3/3 completed | 2/3 completed | 1171 | 669 ms |

One legacy/wrong-hypothesis request timed out at 30 seconds. The integration assertion therefore **failed**, while both current and compact variants completed without errors. The timeout is not SAFE, not a false negative and not proof that the wrong hypothesis caused delay. The model rejected the wrong military hypothesis on the other safe dialogue; this sample does not demonstrate anchoring-induced misclassification.

Compact used **36.4% fewer input tokens** than current observations. The 20 ms difference in maximum completed latency on four cases does not establish a speed improvement. Both new prompts detected both attacks and rejected both safe dialogues; no general accuracy or real-world F1 claim follows from four already-inspected examples.

All completed variants classified `reg-verification-001` as `PAYMENT_CREDENTIAL_THEFT`, while the corpus expects `VERIFICATION_PHISHING`. The attack was detected; its category differs. This highlights the need for consistent purpose-based class definitions, not merely a larger model. Next comparison should include payment-versus-verification contrasts, quoted warnings and ambiguous requests, with independent label review.

Compact stays experimental: when DOM/dialogue history is present it removes overlapping session snapshots and redundant trigger text; when history is absent it uses structured cached roles/ages. It preserves the available earlier history rather than selecting/truncating arbitrary sentences. This does not repair context already omitted by the page adapter. Production continues using observations pending broader comparison. Production changes include the completion cap, conservative per-request budget and timeout on model listing.

Machine results: [groq-prompt-comparison.json](groq-prompt-comparison.json). Runner and limits: [integration README](../integration/README.md). No prompts, raw replies, dialogue text or keys are persisted in the machine report.
