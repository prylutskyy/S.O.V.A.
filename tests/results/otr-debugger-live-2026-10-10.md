# Live debugger verification — 2026-10-10

## Environment

- Site: https://otr.to/, two fresh pairs of controlled test tabs (24/25 and 26/27).
- User manually reloaded the current production extension build before testing.
- Groq temporarily disabled by the user. Both threat attempts showed “ШІ-арбітр (LLM) не зміг обробити запит”, with no usable AI verdict. Decisions were explicitly labelled local heuristics. This does not establish whether Gemini Nano is supported by the browser.
- Groq restored by the user after testing.
- Synthetic dialogue only; no real credentials, identity documents or outside participants.

## Observations

| Check | Observed result | Outcome |
| --- | --- | --- |
| Standalone incoming `Не надсилайте номер паспорта в чаті.` | Safe, R=0, AI requests=0 | Pass |
| Incoming `Надішліть серію та номер паспорта для отримання переказу.` | Personal-data warning; `АКТИВНА ЗАГРОЗА: ПОПЕРЕДЖЕННЯ`; `IDENTITY_PROBING`; local score 45 | Pass |
| Normal key `a` during advisory warning | Composer value became `a` | Pass |
| Clear advisory draft | Warning remained active and score stayed 45 after draft processing | Pass |
| Explicit advisory reset | Banner removed, safe overview, score 0 | Pass |
| Fresh incoming `Please provide your seed phrase and send your password to synchronize wallet` | Critical wallet banner; `АКТИВНА ЗАГРОЗА: ВВІД ЗАБЛОКОВАНО`; `CRYPTO_WALLET_COMPROMISE`; local score 85 | Pass |
| Normal key `a` during lock | Composer value stayed empty | Pass |
| Insert synthetic draft via automation and press Enter | Peer received no reply; active lock remained | Pass for Enter guard |
| Clear critical draft | Active lock and score 85 remained | Pass |
| Explicit critical reset, then key `a` | Safe score 0; composer accepted `a` | Pass |
| Sender of critical request | Safe score 0; AI requests=0 | Pass |

## Evidence

- `otr-debugger-warning-2026-10-10.png`: warning with local score 45 after draft clearing.
- `otr-debugger-reset-2026-10-10.png`: safe score 0 after advisory reset.
- `otr-debugger-critical-2026-10-10.png`: active critical lock with local score 85.

## Scope and limitations

The previous contradictory safe overview during a real alert did not recur in these checks. No source changes were needed during this live run.

The input element itself remains `disabled: false`. Automation can insert a draft directly despite the keyboard guard. The observed protection covers a normal key and Enter; paste, pointer-send, mobile input and every other send path were not verified here. Reset was an explicit user action in the test; it was not an AI SAFE verdict.

This run does not measure corpus precision/recall/F1, cloud classification quality, long-term time weighting, or behavior on other chat platforms. The preceding 42/42 focused automated results remain separate evidence; no automated suite was rerun during this live check.
