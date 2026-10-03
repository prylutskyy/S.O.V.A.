# S.O.V.A. (Context Threat Shield): Development and Architecture Guide

This document describes the project architecture, directory structure, module responsibilities, coding conventions, and developer guidelines for extending the codebase.

---

## 1. Project Architecture (WXT Framework)

The project is built on the [WXT Framework](https://wxt.dev/) targeting Chromium Manifest V3, utilizing TypeScript and Vite for compilation and module bundling.

```text
sova/
├── docs/                             # Documentation and specifications
│   ├── DEVELOPMENT_GUIDE.md          # Architecture and development guide (this file)
│   └── PROJECT_IMPLEMENTATION_SPECIFICATION.md # Complete technical specification
├── entrypoints/                      # Extension entrypoints (Manifest V3 targets)
│   ├── background.ts                 # Service worker (tab lineage, IPC bus, badges)
│   ├── content.ts                    # Content script coordinator injected into pages
│   ├── offscreen.html                # Offscreen DOM host for window.ai Prompt API
│   └── popup/                        # Extension popup UI
│       ├── index.html / main.ts      # Main popup markup and tab controller
│       ├── style.css                 # Popup styles (dark theme design tokens)
│       └── controllers/              # Tab controllers (Shield, Vault, Settings)
├── src/                              # Core application logic and modules
│   ├── ai/                           # Tier 2 AI Arbiter subsystem
│   │   ├── ai-arbiter.service.ts     # Single-flight queue, caching, and abort control
│   │   └── cloud/                    # Cloud LLM dispatcher and drivers (Groq, Gemini, OpenAI)
│   ├── core/                         # Core engines, managers, and crypto primitives
│   │   ├── adapters/                 # Storage adapters (chrome.storage.session/local)
│   │   ├── context-manager.ts        # Tainted Context Window and cross-tab lineage
│   │   ├── crypto-service.ts         # PBKDF2, AES-GCM 256, and HMAC-SHA256 (WebCrypto)
│   │   ├── payment-gateways.ts       # Registry of accredited payment gateways
│   │   ├── personal-vault.ts         # Zero-knowledge DLP vault and blind signature engine
│   │   ├── risk-engine.ts            # Mathematical risk scoring: f(R_tech, C_env, A_user)
│   │   ├── secure-key-store.ts       # Hardware/vault-encrypted API key storage
│   │   ├── user-whitelist.ts         # User-managed domain whitelist
│   │   └── whitelist.ts              # System whitelist and accredited domain rules
│   ├── detectors/                    # Modular form analysis detectors (Pipeline pattern)
│   │   ├── contracts/                # Form detector interfaces (IFormDetector)
│   │   ├── action-mismatch.detector.ts  # Third-party form submission detection
│   │   ├── card-cvv.detector.ts         # Luhn algorithm validation and CVV detection
│   │   ├── form-analysis-pipeline.ts    # Pipeline orchestrator aggregating form heuristics
│   │   ├── hidden-field.detector.ts     # Hidden input detection (Autofill Phishing Traps)
│   │   ├── urgency.detector.ts          # Artificial urgency and dark pattern detection
│   │   └── vault-marker.detector.ts     # Identity probing and bank marker detection
│   ├── heuristics/                   # Tier 1 real-time scanners and linguistic tools
│   │   ├── chat-channel.ts           # Chat DOM observer (MutationObserver)
│   │   ├── chat-session-state.ts     # Dialogue state and session immunity tracking
│   │   ├── chat-simulator.ts         # Adversarial persona simulation
│   │   ├── fuzzy-matcher.ts          # Homoglyph folding, sliding n-grams, Levenshtein
│   │   ├── hidden-field-inspector.ts # Proactive form scanner and trap disabler
│   │   ├── input-detector.ts         # Input field classification and value auditing
│   │   ├── input-interceptor.ts      # Global capture-phase event interceptor
│   │   ├── intent-classifier.ts      # Semantic NLP classifier (8 threat categories)
│   │   ├── proactive-field-protector.ts # Sanctuary Sealed Apertures (readOnly protection)
│   │   ├── sensitive-asset-detector.ts  # PAN, CVV, OTP, and seed phrase extraction
│   │   ├── session-outbound-memory.ts   # Multi-step cumulative leak tracking
│   │   ├── text-normalizer.ts        # Unicode cleaning and homoglyph normalization
│   │   └── vault-scanner.ts          # Form scanner for personal vault markers
│   ├── interceptors/                 # Targeted event interception modules
│   │   ├── chat-submit.interceptor.ts   # Chat message send interception (Enter/click)
│   │   ├── clipboard.interceptor.ts     # Clipboard paste audit and phishing lure detection
│   │   └── form-submit.interceptor.ts   # Form submit interception and modal trigger
│   ├── privacy/                      # Data loss prevention and de-identification
│   │   └── outbound-data-sanitizer.ts   # Zero-knowledge PII/PAN redaction before LLM dispatch
│   ├── types/                        # Shared TypeScript interfaces and types
│   ├── ui/                           # UI components isolated inside Shadow DOM
│   │   ├── chat-live-pill.ts         # Dynamic micro-badge for chat inputs
│   │   ├── debugger-overlay.ts       # Thesis defense HUD and live telemetry (Ctrl+Shift+D)
│   │   ├── design-tokens.ts / .css   # Centralized theme tokens and color palette
│   │   ├── field-live-pill.ts        # Visual capsule and loupe for sealed fields
│   │   ├── friction.ts               # Soft lock floating warning banners
│   │   ├── shadow-host.ts            # Isolated Shadow DOM mount point (#threat-shield-root)
│   │   └── unified-modal.ts          # Fullscreen Hard Lock modal with XAI breakdown
│   ├── xai/                          # Explainable AI subsystem
│   │   └── xai-engine.ts             # Contrast formula (Intent vs Reality) and attack chain
│   └── offscreen.ts                  # Offscreen worker script for local Gemini Nano
├── tests/                            # Automated test suite (Vitest + Happy-DOM)
│   ├── unit/                         # Unit tests covering core, heuristics, detectors, AI
│   └── demo.html                     # Interactive verification testbed (4 attack scenarios)
├── README.md                         # Project overview and quick start guide
├── package.json                      # Dependencies and npm scripts
├── tsconfig.json                     # TypeScript compiler configuration
├── vitest.config.ts                  # Vitest runner configuration
└── wxt.config.ts                     # WXT build configuration and MV3 permissions
```

---

## 2. Subsystem Responsibilities (`src/`)

### 2.1. `src/core/` (System Foundation and Storage)
Contains DOM-independent managers, storage abstractions, and cryptographic primitives:
- `context-manager.ts`: Manages the Tainted Context Window across tabs (`chrome.storage.session`). Coordinates Tab Lineage so child tabs inherit the threat context of an antecedent social engineering conversation.
- `crypto-service.ts`: WebCrypto API service providing PBKDF2 key derivation (100,000 iterations), AES-GCM 256 encryption, and synchronous salted HMAC-SHA256 computation.
- `personal-vault.ts`: Zero-Knowledge DLP vault. In locked state, it retains zero plaintext in RAM, maintaining background protection using salted blind HMAC signatures.
- `risk-engine.ts`: Mathematical calculation of the integral threat score:
  $$\text{RiskScore} = f(R_{\text{tech}}, C_{\text{env}}, A_{\text{user}}) \in [0, 100]$$
- `payment-gateways.ts` and `whitelist.ts`: Strict registries of accredited PCI DSS payment acquirers and trusted infrastructure domains.
- `user-whitelist.ts`: Dynamic user whitelist stored in `chrome.storage.local`.
- `secure-key-store.ts`: Dual-mode encryption (device-encrypted or master-password-encrypted) for external LLM API tokens.

### 2.2. `src/detectors/` (Modular Form Analysis Pipeline)
Implements the Chain of Responsibility pattern for inspecting HTML forms:
- `form-analysis-pipeline.ts`: Coordinates registered `IFormDetector` implementations, evaluates filled sensitive inputs, integrates active threat context bonuses (+35 points), and invokes `RiskEngine`.
- `action-mismatch.detector.ts`: Detects forms directing sensitive payment or credential data to untrusted third-party hosts.
- `hidden-field.detector.ts`: Discovers Autofill Phishing Traps hidden via CSS (`display: none`, `visibility: hidden`, `opacity: 0`, off-screen negative offsets, zero dimensions).
- `card-cvv.detector.ts`: Validates 16-digit card numbers with the Luhn algorithm and detects CVV/expiry inputs.
- `urgency.detector.ts`: Identifies dark patterns, countdown clocks, and artificial urgency.
- `vault-marker.detector.ts`: Inspects field descriptors for recovery marker requests (mother's maiden name, tax ID, secret word).

### 2.3. `src/heuristics/` (Threat Scanners and Linguistic Engines)
DOM-aware and text-based heuristic analyzers operating synchronously in the content script:
- `intent-classifier.ts`: Semantic NLP classifier matching 8 threat categories without relying on broken `\b` word boundaries for Cyrillic scripts.
- `fuzzy-matcher.ts`: Linguistic engine providing homoglyph canonical folding, phonetic vowel normalization, sliding n-grams ($n=2..4$), Damerau-Levenshtein distance, and typo-tolerant tax ID checking.
- `proactive-field-protector.ts`: Sanctuary Sealed Apertures. Proactively seals sensitive inputs (`readOnly = true`) on unaccredited sites before user input occurs.
- `chat-channel.ts` and `chat-session-state.ts`: Passive `MutationObserver` inspecting web chats, buffering fragmented messages, and tracking conversation immunity.
- `input-interceptor.ts`: Global capture-phase event listener (`keydown`, `input`, `paste`) enforcing Soft Lock and Hard Lock modes.
- `session-outbound-memory.ts`: Tracks cumulative credential leakage across multi-step wizard forms.

### 2.4. `src/privacy/` (Outbound Data Sanitization)
- `outbound-data-sanitizer.ts`: Pre-flight DLP gateway. Strips and redacts real payment cards (Luhn-verified), CVVs, phone numbers, IBANs, passports, and vault secrets before constructing prompts for external LLMs.

### 2.5. `src/ai/` (Tier 2 AI Arbiter Subsystem)
Asynchronous verification layer combining local and cloud LLM execution:
- `ai-arbiter.service.ts`: Coordinates AI verification using a single-flight queue pattern with `AbortController`, preventing request starvation during rapid typing. Implements a 5-minute LRU cache, session quarantine, and session immunity.
- `cloud/cloud-llm-dispatcher.ts`: Routes verification requests to configured cloud providers.
- `cloud/drivers/groq-driver.ts`: Ultra-low-latency (180-320 ms) driver for Groq LPU endpoints using strict JSON formatting.
- `cloud/drivers/`: Dedicated drivers for Google Gemini, OpenAI, and OpenRouter.

### 2.6. `src/ui/` (Shadow DOM Presentation Layer)
Encapsulated user interface components mounted inside a single Shadow Root (`#threat-shield-root`):
- `shadow-host.ts`: Guarantees isolation from target page stylesheets and scripts.
- `unified-modal.ts`: Fullscreen modal window triggered on critical risk, offering XAI breakdowns, decoy injection, and conscious override controls.
- `friction.ts`: Floating context warning banners and soft lock notifications.
- `chat-live-pill.ts` and `field-live-pill.ts`: Inline micro-indicators attached directly to input elements.
- `debugger-overlay.ts`: Real-time HUD displaying heuristic traces, threat scores, and raw LLM responses (toggleable via `Ctrl + Shift + D`).

### 2.7. `src/xai/` (Explainable AI Engine)
- `xai-engine.ts`: Generates human-centered explanations following the contrast formula (*User Intent vs Threat Reality*), extracts transaction amounts from the page DOM, and reconstructs multi-step attack chains.

---

## 3. Development Guidelines and Code Conventions

### 3.1. Adding a New Form Detector
1. Place the detector file in `src/detectors/your-name.detector.ts`.
2. Implement the `IFormDetector` contract:
   ```typescript
   import { IFormDetector, FormDetectorContext } from './contracts/form-detector.interface';
   import { HeuristicResult } from '../types';

   export class CustomDetector implements IFormDetector {
     public readonly id = 'custom_detector';

     public scan(form: HTMLFormElement, context: FormDetectorContext): HeuristicResult[] {
       const results: HeuristicResult[] = [];
       // Perform inspection logic
       return results;
     }
   }
   ```
3. Register the detector in `src/detectors/form-analysis-pipeline.ts` inside `registerDefaultDetectors()`.
4. Add a corresponding test suite in `tests/unit/detectors/your-name.detector.test.ts`.

### 3.2. Adding a New Intent Category or Cluster
1. Open `src/heuristics/intent-classifier.ts`.
2. To introduce a new word cluster, add an entry to `IntentClassifier.clusters`:
   ```typescript
   {
     cluster: 'custom_cluster',
     weight: 35,
     patterns: [
       /(?:pattern_one|pattern_two)[a-zа-яіїє]*/gi,
     ],
   }
   ```
   *Note: Do not use ASCII word boundaries (`\b`) for Cyrillic words. Use specific prefixes or suffixes.*
3. To define a complete threat scenario, add an `IntentDefinition` to `intentDefinitions`:
   ```typescript
   {
     type: 'CUSTOM_THREAT_TYPE',
     title: 'Human-readable title',
     requiredClusters: [['custom_cluster', 'action_link']],
     minClusters: 2,
     minScore: 45,
     explanationTemplate: (_clusters, words) => `Explanation text with ${words.join(', ')}`,
     carefulAdvice: 'Actionable guidance for the user',
   }
   ```
4. Update `ScamIntentType` in `src/heuristics/intent-classifier.ts` and verify unit tests in `tests/unit/heuristics/intent-classifier.test.ts`.

### 3.3. Creating a New UI Component in Shadow DOM
All visual elements injected into third-party web pages must reside inside the Shadow DOM to avoid CSS collisions and tampering:
1. File location: `src/ui/your-component.ts`.
2. Always attach the root element via `ShadowHost.append(element)`.
3. Never append style tags to `document.head`. Import and apply tokens from `src/ui/design-tokens.ts` or embed styles within your element's encapsulated scope.

### 3.4. Adding a Cloud LLM Driver
1. File location: `src/ai/cloud/drivers/your-driver.ts`.
2. Implement `ICloudLLMDriver` from `src/ai/cloud/types.ts`.
3. Support the strict JSON response format (`isScam`, `confidence`, `scamType`, `reasoning`).
4. Register the driver in `src/ai/cloud/cloud-llm-dispatcher.ts`.
5. Add unit tests verifying mock HTTP requests and error handling in `tests/unit/ai/`.

---

## 4. Two-Tier Detection Pipeline (Tier 1 and Tier 2)

```text
[User Interaction: Form Input / Chat Message]
                     │
                     ▼
[Tier 1: Synchronous Heuristic Pipeline] (0 ms, CPU-efficient)
  ├── IntentClassifier (cluster scanning)
  ├── FormAnalysisPipeline (5 modular detectors)
  ├── ProactiveFieldProtector (Sanctuary readOnly check)
  └── Zero-Knowledge Vault Matching (HMAC-SHA256 candidate check)
                     │
         Threat confidence >= 50%?
         ├── NO  ──> Allow action without disruption
         └── YES ──> Activate Hard Lock / Soft Lock
                     │
                     ▼
[Tier 2: Asynchronous AI Arbiter] (Non-blocking background validation)
  ├── OutboundDataSanitizer (PII/PAN redaction)
  ├── Single-Flight Queue (cancels stale in-flight requests via AbortController)
  ├── LRU Cache Check (5-minute TTL)
  ├── Dispatch to Groq LPU / Cloud LLM (or fallback to Offscreen Gemini Nano)
  └── Verdict Evaluation:
        ├── Scam confirmed ──> Keep Hard Lock, update XAI reasoning
        └── False positive ──> Clear lock, broadcast CONTEXT_CLEARED, restore form
```

### Golden Rules of Asynchronous Execution:
1. **Never block the content script thread:** The synchronous flow of `entrypoints/content.ts` must never await `chrome.runtime.sendMessage` or LLM API calls before allowing basic navigation on safe sites. Always use callbacks, non-blocking promises, or optimistic UI locks.
2. **Sanitize before dispatch:** No raw message text containing unmasked card numbers, CVVs, or personal identifiers may be sent across the network. Always pass outbound content through `OutboundDataSanitizer.sanitize()`.

---

## 5. Testing and Validation

The project maintains a 100% test pass rate across all modules.

### Commands:
- Run all tests once:
  ```bash
  npm test
  ```
- Run tests in watch mode during development:
  ```bash
  npm run test:watch
  ```
- Typecheck without emitting files:
  ```bash
  npm run compile
  ```

### Test Directory Mapping:
- Core engine and crypto tests: `tests/unit/core/`
- Detector pipeline tests: `tests/unit/detectors/`
- Heuristic and classifier tests: `tests/unit/heuristics/`
- AI arbiter and driver tests: `tests/unit/ai/`
- UI and interceptor tests: `tests/unit/ui/` and `tests/unit/interceptors/`

When introducing any change to `src/core/`, `src/heuristics/`, `src/detectors/`, or `src/ai/`, ensure corresponding unit tests are added or updated in `tests/unit/`.
