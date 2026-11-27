# E2E Test Infrastructure & Methodology (`TEST_INFRA.md`)

**Platform:** Unified AUCTUM.ATLAS & AUCTUM Command (Fiduciary OS™)  
**Test Suite Root:** `fiduciary-os/e2e/`  
**Methodology:** Opaque-Box, Requirement-Driven, 4-Tier Verification (`F1`–`F18`)  
**Sources of Truth:** `ORIGINAL_REQUEST.md`, `PROJECT.md` (§ Feature Inventory & § Interface Contracts)

---

## 1. Test Architecture & Runtime

The E2E suite is designed to run cleanly and deterministically on the host with **zero external npm dependencies** and **no heavy browser binaries required**, using Node.js 22 built-in primitives:

- **Runtime:** Node.js `v22.x` (verified on `v22.23.5`)
- **Test Framework:** Native `node:test` (`run()` programmatic API + `describe`/`it`) + `node:assert/strict` (ESM `.mjs`)
- **HTTP Client:** Native `fetch` with strict timeout handling and structured `[F<n> / M<m>]` diagnostic errors
- **ZIP / RO-Crate Inspector:** Pure-Node ZIP Central Directory + `node:zlib` inspector (validates `ro-crate-metadata.json` JSON-LD 1.1 and SHA-256 checksums without external dependencies)
- **CLI Gate Runner:** `node:child_process` (`execFileSync`) for invoking `npm --prefix fiduciary-os/frontend run lint:copy` against clean repo and isolated `/tmp` synthetic violation fixtures
- **Environment Configuration (`fiduciary-os/e2e/lib/config.mjs`):**
  - `E2E_BACKEND_URL` (default: `http://localhost:3001`)
  - `E2E_TRUST_CORE_URL` (default: `http://localhost:3002`)
  - `E2E_FRONTEND_URL` (default: `http://localhost:5173`)
  - `E2E_REPO_ROOT` (default: resolved `../../` from `fiduciary-os/e2e/`)
  - `E2E_TIMEOUT_MS` (default: `8000`)

### Opaque-Box & No-Fake-Pass Policy
1. **Zero Internal Coupling:** Tests NEVER import backend services, Prisma clients, or internal React implementation modules. All assertions run against external HTTP APIs, live frontend responses/public contracts, CLI exit codes, compose/schema artifacts, and root financial/roadmap documents.
2. **Strict No-Fake-Pass Rule:** No `test.skip`, `test.todo`, conditional pass-on-404, or mocked API stubs. Unimplemented endpoints/UI/CLI gates MUST fail cleanly with structured `[F#/M#]` diagnostics until Milestones M1–M5 land.
3. **Deterministic Isolation:** Every run creates a unique `e2e-<runId>` namespace for CRM/Consent/Provenance entities and cleans up temporary fixture files in `/tmp` automatically.

---

## 2. Runner Invocation

```bash
# Run full 4-tier E2E suite (Tiers 1–4) with per-tier & per-feature summary
node fiduciary-os/e2e/run-e2e.mjs
# or via npm:
npm --prefix fiduciary-os/e2e test

# Run individual tiers deterministically
npm --prefix fiduciary-os/e2e run test:tier1
npm --prefix fiduciary-os/e2e run test:tier2
npm --prefix fiduciary-os/e2e run test:tier3
npm --prefix fiduciary-os/e2e run test:tier4

# Syntax / load validation of all E2E harness & spec files (zero runtime failures)
npm --prefix fiduciary-os/e2e run check
```

### Reporting Artifacts
Every run prints a per-tier summary table to stdout and writes:
- `fiduciary-os/e2e/e2e-report.json` — machine-readable totals by Tier (`tier1`–`tier4`), Feature (`F1`–`F18`), and per-test diagnostics
- `fiduciary-os/e2e/e2e-summary.md` — human-readable Markdown coverage & pass/fail matrix

---

## 3. Directory Layout (`fiduciary-os/e2e/`)

```text
fiduciary-os/e2e/
├── package.json                                  # "type": "module", zero external deps, scripts: test, test:tier1..4, check
├── run-e2e.mjs                                   # Programmatic node:test runner with --tier filter & JSON/MD reporter
├── lib/
│   ├── config.mjs                                # Env URLs, REPO_ROOT, timeouts, unique RUN_ID
│   ├── http.mjs                                  # apiFetch() with timeout, JSON parsing, & [F#/M#] diagnostics
│   ├── fixtures.mjs                              # 10-row Lexicon, 6 banned phrases, Albers/Itten palette, 3-gen household, UW/MC/PII vectors
│   ├── zip.mjs                                   # Zero-dep ZIP & RO-Crate 1.1 JSON-LD validator
│   └── fs-helpers.mjs                            # Repo artifact readers, isolated /tmp fixture helper, Masternex scanner
└── tests/
    ├── tier1/                                    # 18 specs: F1–F18 isolated feature happy paths
    │   ├── f01-lexicon.test.mjs
    │   ├── f02-copy-linter.test.mjs
    │   ├── f03-disclosures-risk-drawer.test.mjs
    │   ├── f04-consent-ledger.test.mjs
    │   ├── f05-lifecycle-xstate-wizard.test.mjs
    │   ├── f06-coupled-studios.test.mjs
    │   ├── f07-real-property-studio.test.mjs
    │   ├── f08-crm-pgcrypto-no-masternex.test.mjs
    │   ├── f09-surfaces-mobile-tracker.test.mjs
    │   ├── f10-wcag-viz-system.test.mjs
    │   ├── f11-six-signature-charts.test.mjs
    │   ├── f12-kdense-provenance.test.mjs
    │   ├── f13-skill-governance.test.mjs
    │   ├── f14-biomimicry-honeybee.test.mjs
    │   ├── f15-audited-connectors.test.mjs
    │   ├── f16-orchestration-spine.test.mjs
    │   ├── f17-compliance-gates-worm.test.mjs
    │   └── f18-unit-economics-roadmap.test.mjs
    ├── tier2/                                    # 4 specs: Boundary & corner cases
    │   ├── crm-and-property-boundaries.test.mjs
    │   ├── monte-carlo-boundaries.test.mjs
    │   ├── compliance-pii-and-copy-boundaries.test.mjs
    │   └── orchestration-and-connectors-boundaries.test.mjs
    ├── tier3/                                    # 7 specs: Cross-feature pairwise combinations
    │   ├── 01-consent-blocks-outbound.test.mjs
    │   ├── 02-charts-risk-drawer-a11y-palette.test.mjs
    │   ├── 03-honeybee-nonconvergence-hitl.test.mjs
    │   ├── 04-crm-graph-to-constellation.test.mjs
    │   ├── 05-masternex-zero-reference.test.mjs
    │   ├── 06-kdense-freeze-rocrate-worm.test.mjs
    │   └── 07-lexicon-and-copy-linter-isolation.test.mjs
    └── tier4/                                    # 6 specs: Real-world application scenarios
        ├── scenario-01-planner-parent-stewardship.test.mjs
        ├── scenario-02-advisor-quote-suitability.test.mjs
        ├── scenario-03-multigen-family-alignment.test.mjs
        ├── scenario-04-real-property-committee.test.mjs
        ├── scenario-05-privacy-regulatory-audit.test.mjs
        └── scenario-06-high-volatility-guardrail.test.mjs
```

---

## 4. Feature Inventory Coverage Matrix (`F1`–`F18`)

| Feature | Description | Milestone | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---|---|---|---|---|---|
| **F1** | Bifurcated Plain-Language Lexicon (10-Row Mapping) | M2 | `f01-lexicon` | `compliance-pii-and-copy` | `07-lexicon-and-copy-linter` | S1, S3, S6 |
| **F2** | Automated Copy & Compliance Linter (`lint:copy`) | M2 | `f02-copy-linter` | `compliance-pii-and-copy` | `07-lexicon-and-copy-linter` | S6 |
| **F3** | Context-Aware Disclosures & SEC 206(4)-1 Risk Drawer | M2 | `f03-disclosures-risk-drawer` | — | `02-charts-risk-drawer-a11y` | S1, S2, S6 |
| **F4** | CAN-SPAM, TCPA & GDPR/CCPA Consent Ledger | M1, M2 | `f04-consent-ledger` | `orchestration-and-connectors` | `01-consent-blocks-outbound` | S3, S5 |
| **F5** | Continuous 5-Stage Lifecycle Flow & 6-Step XState Wizard | M2 | `f05-lifecycle-xstate-wizard` | — | — | S1 |
| **F6** | 11 Coupled Financial & Tangible Asset Studios | M2, M3 | `f06-coupled-studios` | — | — | S1, S3, S4 |
| **F7** | Real Property & Tangible Asset Studio (#11) | M3 | `f07-real-property-studio` | `crm-and-property` | `02-charts-risk-drawer-a11y` | S1, S4 |
| **F8** | PostgreSQL + `pgcrypto` CRM & Masternex Removal | M1 | `f08-crm-pgcrypto-no-masternex` | `crm-and-property` | `04-crm-graph-to-constellation`, `05-masternex-zero-reference` | S2, S3, S5 |
| **F9** | 7 Platform Surfaces & Mobile Policy Tracker | M2 | `f09-surfaces-mobile-tracker` | — | — | S1, S2 |
| **F10** | WCAG 2.2 Accessible Visualization System | M3 | `f10-wcag-viz-system` | — | `02-charts-risk-drawer-a11y` | S1, S3, S4 |
| **F11** | 6 Signature Interactive Charts & Static Ratio Ban | M3 | `f11-six-signature-charts` | `monte-carlo-boundaries` | `02-charts-risk-drawer-a11y`, `04-crm-graph-to-constellation` | S1, S2, S3, S4, S6 |
| **F12** | K-Dense Dual-Loop & Dual-Record Provenance / RO-Crate 1.1 | M4 | `f12-kdense-provenance` | — | `06-kdense-freeze-rocrate-worm` | S1, S5 |
| **F13** | Vetted `claude-skills-mcp` & `mimeo` Skill Governance | M4 | `f13-skill-governance` | — | — | — |
| **F14** | Biomimicry 3.8 & Honeybee Democracy Governance | M4 | `f14-biomimicry-honeybee` | — | `03-honeybee-nonconvergence-hitl` | S1, S3 |
| **F15** | Audited Financial, Insurance & Identity Connectors | M4 | `f15-audited-connectors` | `orchestration-and-connectors` | `01-consent-blocks-outbound` | S2 |
| **F16** | Layered Stateful AI Orchestration Spine | M4 | `f16-orchestration-spine` | `orchestration-and-connectors` | — | S1 |
| **F17** | 4 Runtime Compliance Gates & Immutable Audit Ledger | M1, M2 | `f17-compliance-gates-worm` | `compliance-pii-and-copy` | `03-honeybee-nonconvergence-hitl`, `06-kdense-freeze-rocrate-worm` | S2, S5, S6 |
| **F18** | Reconciled Unit Economics, Phases 1–4 & 5 Founder Decisions | M5 | `f18-unit-economics-roadmap` | — | — | — |

---

## 5. 4-Tier Methodology & Coverage Thresholds

- **Tier 1 (Feature Coverage):** 18/18 features (`F1`–`F18`) have dedicated isolated happy-path specs (100% feature coverage).
- **Tier 2 (Boundary & Corner Cases):** 4 dedicated boundary specs covering empty/zero/negative/overflow/invalid inputs, Monte Carlo path bounds (`0`, `-1`, `1`, `10000`, `10001`), unsourced static ratios (`1.25x`, `11.10%`), PII redaction & prompt injection variants, banned-phrase variants, Temporal >2 MB payload guard, Plaid Free-tier 1-connection cap, Compulife missing `REMOTE_IP`, and invalid consent enums.
- **Tier 3 (Cross-Feature Combinations):** 7 pairwise integration specs verifying multi-subsystem invariants across Consent×Outbound, Charts×RiskDrawer×WCAG×Albers/Itten, Honeybee×Gate 3 HITL, CRM×Constellation, Masternex zero-reference, K-Dense×Freeze×RO-Crate×Gate 4 WORM, and Lexicon×Copy Linter isolation.
- **Tier 4 (Real-World Application Scenarios):** 6 end-to-end multi-step household stewardship and licensed advisor journeys.
- **Milestone M6 Acceptance Threshold:** **100% pass rate across all 4 tiers**, **0 skipped tests**, **0 syntax/harness errors**, and **0 integrity violations**.
