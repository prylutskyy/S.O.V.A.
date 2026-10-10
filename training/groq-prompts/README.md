# Historical paired prompt cohort

`cohort-v1.json` freezes 40 different dialogues for the Groq comparison: 6 verification, 6 payment, 6 military recruitment, 6 off-platform and 16 safe controls. Six are multi-turn authority/media pretexts. Previous four smoke examples are excluded. Selection was frozen before the paired API run; sources are development/regressions and the existing social-engineering pilot, not independently collected real conversations or a blind holdout.

The original expected labels are preserved. Three off-platform examples carry `annotationReview`: asking to coordinate elsewhere, without deception or covert isolation, does not establish an active scam. Keep their frozen-label outcomes visible and separately report the remaining 37 examples; do not silently relabel them after seeing model output. Independent human review remains pending.

Both variants use the same general class definitions in `src/ai/cloud/threat-taxonomy.ts`. Verification/support/recovery purpose takes precedence over generic payment credential theft. Keywords and local candidate labels are never ground truth. Expected labels and review notes are not sent to Groq; the model sees sanitized message text, roles, available context and neutral observations.

Run instructions, request caps, hidden credential input and explicit resume are documented in `tests/integration/README.md`. API result files contain only case IDs, labels, confidence, latency and usage—not dialogue text, prompts, raw replies or keys. This cohort evaluates API classifications; it does not execute browser protection actions or validate message extraction on arbitrary websites.
