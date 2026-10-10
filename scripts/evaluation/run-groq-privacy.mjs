// Reuse the hidden-input runner; keys never become command-line arguments or files.
process.env.GROQ_PRIVACY_SMOKE = '1';
await import('./run-groq-prompts.mjs');
