# Project: Unified AUCTUM.ATLAS & AUCTUM Command (Fiduciary OS™) Platform

## Architecture
- **Dual-Sided Unified Ecosystem**:
  - **AUCTUM.ATLAS (Consumer / Household Portal)**: Warm, plain-language family wealth system (*"Build a Future for Your Family, One Step at a Time."*) following a continuous 5-stage household flow (`Discover & Orient` → `Learn & Assess` → `Map & Model` → `Verify & Escalate` → `Steward & Transfer`), governed by strict educational boundaries, persistent disclaimers, and SEC Marketing Rule 206(4)-1 Risk Drawers.
  - **AUCTUM Command (Licensed Advisor & Compliance Core, powered by Fiduciary OS™)**: Compliance-grade institutional workstation with multi-carrier quoting, K-Dense Dual-Record Provenance viewer, Temporal HITL approval queues, and FINRA 4511 WORM archiving.
- **Data & Persistence Layer**:
  - **PostgreSQL 16 + `pgvector` + `pgcrypto` + `uuid-ossp`** (replacing `MASTERNEX.os` completely): Native Household Graph CRM (`Household`, `Person`, `HouseholdMember`, `CrmAccount`, `Appointment`, `LifeEvent`), CAN-SPAM/TCPA/GDPR/CCPA `ConsentRecord` ledger, append-only Merkle-chained `ProvenanceRecord` table (`pg_advisory_xact_lock` + immutability triggers), AES-256-GCM SSN column encryption, and PL/pgSQL `export_user_data` / `soft_delete_user` routines.
  - **Trust-Core (`trust-core/`, port 3002)**: Deterministic calculation engine (10,000-path Monte Carlo, tax, annuity, mortality, exact 4-factor Shapley attribution), durable cryptographic evidence ledger (migrated off `LEDGER_MODE=memory`), and MCP server.
- **Visualization & Frontend Layer (`fiduciary-os/frontend/`, port 5173)**:
  - React 19 + Vite 8 + TypeScript 7 + **XState** (6-step onboarding) + **Visx 4.0** (SVG/React primary) + **Apache ECharts 6.1** (Canvas/LTTB 10,000-path simulations & parallel coordinates) + **D3 layout math** (`d3-sankey`, `d3-hierarchy`, `d3-scale`) + Google Maps `AdvancedMarkerElement` (with local-first fallback).
  - WCAG 2.2 AA compliant: every chart paired with an **Accessible Data Table**, Albers/Itten palette (`#1B365D` navy, `#2E6F5E` sage, `#C27D2C` amber, `#B83A3A` crimson for deficits only), 220ms `cubic-bezier(0.16, 1, 0.3, 1)` transitions, automated `lint:copy` & `lint:styles` gates.
- **AI, Provenance & Orchestration Layer (`fiduciary-os/backend/`, port 3001)**:
  - **Temporal** (outer durability spine; payloads >2 MB stored in S3 with compact UUID refs) + **LangGraph** (bounded inner reasoning graph) + **Camunda DMN** (deterministic regulatory decision tables) + **MCP / A2A** interoperability.
  - **K-Dense Dual-Loop Verification** (Outer Planning + Inner Sandboxed Execution & Math/Compliance Review) + **Dual-Record Provenance** (Living Lab Notebook + unforgeable host-observed Provenance Log + SHA-256 hash-chained Frozen Analysis Plan + RO-Crate 1.1 ZIP export).
  - **Biomimicry 3.8** Multi-Constraint Cash-Flow Solver + **Honeybee Democracy** Household Alignment Mode & 4-Scout Swarm Critic Gate.
  - **4 Runtime Compliance Gates**: (1) PII Redaction & Scope Gate, (2) FINRA 2210 / SEC 206(4)-1 Content Guard, (3) HITL Escalation Pause, (4) Dual-Record 7-Year S3 Object Lock WORM Archiving.
  - **Audited Connectors**: Plaid FDX (`/transactions/sync` cursors, Free-tier cap), iPipeline Novera/OneView™, Annuity Rate Watch (Wink failover), CANNEX, Compulife (`REMOTE_IP` + US/CA Auth IDs), Google Maps + Gemini 4 Interactions (`Api-Revision: 2026-05-20`), Auth0/OIDC + PKCE + Argon2id + AWS KMS, Twilio + SendGrid/SES.

## Conflict Resolutions (from Survey Synthesis)
1. **Brand Namespace (`AUCTUM.ATLAS` Roofing vs. Family Wealth)**: In this repository, `AUCTUM.ATLAS` is the consumer Family Wealth Portal and `AUCTUM Command (powered by Fiduciary OS™)` is the licensed Advisor Core per `ORIGINAL_REQUEST.md` and `AUCTUM.ATLAS Platform Architecture Redesign`. The cross-ecosystem Tier B isolation note from `Next-Gen Gig Platform Architecture` Tab 2 is documented as an explicit Governance Note in `UNIFIED_PLATFORM_BLUEPRINT.md` (M5) for founder sign-off.
2. **Year 5 Base Total Revenue (`$21.05M` vs. `$28.02M`) & Upside (`$51.7M`)**: `Unit_Economics.md` v2.0 already matches the corrected LTV/CAC (`$4,950/9.9x`, `$14,950/10.0x`, `$120,000/15.0x`, `$255/8.5x`) and Year 5 Base ARR (`$19.95M`). M5 reconciles the Revenue table explicitly: **Pure-SaaS Base Case** (`$19.95M` ARR / `$21.05M` Rev, excluding unlicensed insurance rev-share), **Legacy v1 Reference** (`$28.02M` Rev), and **Licensed-Partner Upside Case** (`$51.7M` Rev, gated on licensed agency/BD channel).
3. **Masternex.OS Decommissioning**: `MASTERNEX.os` has zero CRM entities; its 7 env-gated HTTP endpoints are ported to native PostgreSQL+`pgcrypto`, deterministic Shapley, Camunda DMN, K-Dense Provenance, and native PropertyInsight underwriting, and the `masternex` Docker service is removed (M1).

## Feature Inventory
Every Survey feature is assigned a Milestone (none unassigned).

| # | Feature | Description | Milestone | Source |
|---|---|---|---|---|
| F0 | Environment Setup & Verification Baseline (`/env-setup`) | Repeatable setup script, Prisma client regeneration, isolated `fiduciary_os_test` DB, `pgcrypto` init, `trust-core` test script fix | M0 | `explorer_survey_1` |
| F1 | Bifurcated Plain-Language Lexicon (10-Row Mapping) | Consumer (`AUCTUM.ATLAS`) vs. Advisor (`AUCTUM Command`) vocabulary + Sage-and-Caregiver voice & H1 tagline | M2 | `ORIGINAL_REQUEST.md` §1, Redesign Doc §1 |
| F2 | Automated Copy & Compliance Linter (`lint:copy`) | CI script banning 6 promotional phrases, legacy unsourced ratios, and B2C advisor-jargon leaks | M2 | `ORIGINAL_REQUEST.md` §1, Redesign Doc §1 |
| F3 | Context-Aware Disclosures & SEC 206(4)-1 Risk Drawer | Persistent educational disclaimer + expandable Risk Drawer mounted on every forward-looking chart | M2 | `ORIGINAL_REQUEST.md` §1, Redesign Doc §1 & §3 |
| F4 | CAN-SPAM, TCPA & GDPR/CCPA Consent Ledger | Double-opt-in communication ledger + outbound dispatch guard + UI consent preferences | M1, M2 | `ORIGINAL_REQUEST.md` §1, Redesign Doc §1 & §5 |
| F5 | Continuous 5-Stage Lifecycle Flow & 6-Step XState Wizard | Discover & Orient (3-Slider Checkup) → Learn & Assess (6-step XState + 5-min micro-lessons) → Map & Model → Verify & Escalate → Steward & Transfer | M2 | `ORIGINAL_REQUEST.md` §2, Redesign Doc §2 |
| F6 | 11 Coupled Financial & Tangible Asset Studios | All 10 Navigators + Studio #11 Real Property & Tangible Asset Studio coupled via Unified Cash-Flow Router | M2, M3 | `ORIGINAL_REQUEST.md` §2, Redesign Doc §2 |
| F7 | Real Property & Tangible Asset Studio (#11) | Adapted from `AUCTUM.Insights` (`calcUW` Buy & Hold/BRRRR/STR, 30-yr amortization, 10-yr curves, 2³ DOE, Google Maps `AdvancedMarkerElement`, Gemini 4 Interactions, `.md` Committee Memo) | M3 | `ORIGINAL_REQUEST.md` §2–3, `explorer_survey_2` |
| F8 | PostgreSQL + `pgcrypto` Household Graph CRM & Masternex Removal | People, Households, Multi-Gen Roles, Accounts, Appointments, Life Events, AES-256-GCM SSN, `export_user_data`/`soft_delete_user`, remove `masternex` container & service | M1 | `ORIGINAL_REQUEST.md` §2, `explorer_survey_1` & `2` |
| F9 | 7 Platform Surfaces & Mobile Policy Tracker | Public Homepage, Onboarding/Learning Hub, Wealth Canvas, Property Studio, Advisor Command Center (wired to live Postgres CRM), Outreach/Compliance Hub, Mobile Policy/Task Tracker | M2 | Redesign Doc §2 |
| F10 | WCAG 2.2 Accessible Visualization System | Visx 4.0 + Apache ECharts 6.1 + D3 layout math, paired Accessible Data Table per chart, Albers/Itten palette (`#1B365D`/`#2E6F5E`/`#C27D2C`/`#B83A3A`), 220ms transitions | M3 | `ORIGINAL_REQUEST.md` §3, Redesign Doc §3 |
| F11 | 6 Signature Interactive Charts & Static Ratio Ban | Canopy (Visx+Sankey), 10,000-Path Longevity Fan (ECharts LTTB), Fee-Drag Recovery (Visx), Beneficiary Constellation (Visx+Hierarchy), Real Property Map (Canvas+Maps), Carrier Frontier (ECharts Parallel Coords); hard-disable unsourced static ratios | M3 | `ORIGINAL_REQUEST.md` §3, Redesign Doc §3 |
| F12 | K-Dense Dual-Loop Verification & Dual-Record Provenance | Outer Planning + Inner Sandboxed Execution/Math Review; Living Lab Notebook + unforgeable Provenance Log + hash-chained Frozen Analysis Plan + RO-Crate 1.1 ZIP WORM export | M4 | `ORIGINAL_REQUEST.md` §4, `explorer_survey_2` |
| F13 | Vetted `claude-skills-mcp` & `mimeo` Skill Governance | Behavioral security scan gate (`cisco-ai-skill-scanner`), allowlisted MCP skill tools, read-only `mimeo` pedagogy checklists | M4 | `ORIGINAL_REQUEST.md` §4, Redesign Doc §4 |
| F14 | Biomimicry 3.8 & Honeybee Democracy Governance | Multi-Constraint Cash-Flow Solver, Honeybee Democracy Household Alignment Mode, 4-Scout Swarm Critic Gate with auto-HITL escalation | M4 | `ORIGINAL_REQUEST.md` §4, Redesign Doc §4 |
| F15 | Audited Financial, Insurance & Identity Connectors | Plaid FDX (`/transactions/sync` cursors, Free-tier cap), iPipeline Novera/OneView, ARW, CANNEX, Compulife (`REMOTE_IP`), Google Maps + Gemini 4, Auth0/OIDC + Argon2id + KMS, Twilio/SES | M4 | `ORIGINAL_REQUEST.md` §5, Redesign Doc §5 |
| F16 | Layered Stateful AI Orchestration Spine | Temporal (S3 UUID refs < 2 MB gRPC limit) + LangGraph + Camunda DMN + MCP/A2A interoperability | M4 | `ORIGINAL_REQUEST.md` §5, Redesign Doc §5 |
| F17 | 4 Runtime Compliance Gates & Immutable Audit Ledger | Gate 1 PII Redaction/Scope, Gate 2 FINRA 2210/SEC 206(4)-1 Guard, Gate 3 HITL Escalation Pause, Gate 4 7-Year S3 Object Lock WORM + Postgres Merkle Hash Chain | M1, M2 | `ORIGINAL_REQUEST.md` §5, Redesign Doc §5 |
| F18 | Reconciled Unit Economics, Phases 1–4 & 5 Founder Decisions | Reconcile `Unit_Economics.md`, `FINANCIAL_MODEL_PACKAGE.md`, `07_Scenario_Analysis.csv` (LTV/CAC + Year 5 Base vs Upside), Phases 1–4 (Flagger canary), 5 Founder Decisions | M5 | `ORIGINAL_REQUEST.md` §6, `spec_miner_survey_3` |
| F19 | Cross-Ecosystem Brand & `@auctum/engine` Governance Note | Document Brand Namespace resolution (AUCTUM.ATLAS vs RoofPro/Tier B), Founder Decision #5 Drive folder audit (`15lAFlPFTUTNs0uymgE_iBJ8yickAAWU2`), and optional `@auctum/engine` field attestation hooks | M5 | `spec_miner_survey_3` |

## Milestones
| # | Name | Scope | Dependencies | Status | Sub-Orch Conv ID |
|---|------|-------|-------------|--------|------------------|
| M0 | Environment Setup & Verification Baseline | `/env-setup` script, Prisma generate, `fiduciary_os_test` DB, `pgcrypto` init, `trust-core` test fix, baseline green tests | none | DONE (110 FE + 101 BE + 1 TC pass, Auditor CLEAN) | `6c655796a01fb59507b5563d8e850ddc` |
| M1 | PostgreSQL+`pgcrypto` CRM, WORM/Consent Schema & Masternex Removal | Prisma CRM/Consent/Merkle models, PL/pgSQL privacy routines, CRM/Consent/Privacy APIs, durable `trust-core` ledger, full `masternex` removal | M0 | DONE (110 BE + 7 TC pass, 0 masternex, 6/6 probes, Auditor CLEAN) | `8d1dc0c25ef893ea7b3fcb45142295e8` |
| M2 | Bifurcated Lexicon, Copy Linter, 4 Compliance Gates & 5-Stage XState Flow | 10-row lexicon, `lint:copy`, Risk Drawer, 5-stage flow + 6-step XState wizard, live CRM UI wiring, 4 runtime compliance gates | M1 | IN_PROGRESS | `c42f80248b685a3758b55352acfa794f` |
| M3 | WCAG 2.2 Visualization System, 6 Signature Charts & Real Property Studio | Visx 4.0 + ECharts 6.1 + D3 + Accessible Data Tables, all 6 signature charts, 10,000-path MC, PropertyInsight Studio #11, static ratio ban | M2 | PLANNED | — |
| M4 | K-Dense Dual-Loop, Provenance, Honeybee, Orchestration Spine & Connectors | Dual-Loop, Dual-Record Provenance + RO-Crate 1.1, Skill Governance, Biomimicry/Honeybee, Temporal+LangGraph+Camunda DMN+MCP/A2A, audited connectors | M1 | IN_PROGRESS | `143bf8fe5455b931e268207e7430e13c` |
| M5 | Reconciled Unit Economics, Rollout Phases 1–4 & 5 Founder Decisions | Reconcile `Unit_Economics.md` / CSVs / `FINANCIAL_MODEL_PACKAGE.md`, publish `UNIFIED_PLATFORM_BLUEPRINT.md` with Phases 1–4 & 5 Founder Decisions | none | DONE (build_model.py SHA-256 verified, 46/46 links, Auditor CLEAN) | `f9fcf9fb69d0e5da6e3e2746f9583873` |
| E2E | Independent Opaque-Box E2E Testing Track | Requirement-driven E2E suite (Tiers 1–4) covering F1–F18, `TEST_INFRA.md` & `TEST_READY.md` | none | DONE (`TEST_READY.md`, 35 specs / 61 tests, Auditor CLEAN) | `ce3bfb2285d45e6ea13106913dfc7314` |
| M6 | Final Milestone: 100% E2E Pass + Tier 5 Hardening + Whole-Project Audit | Phase 1: Tiers 1–4 E2E pass; Phase 2: Tier 5 Adversarial Coverage Hardening + Whole-Project Forensic Audit | M0–M5, E2E | PLANNED | — |

## Interface Contracts
### Backend CRM, Consent & Privacy API ↔ Frontend (`M1 ↔ M2/M3`)
- `GET/POST/PATCH /api/v1/crm/households`, `/api/v1/crm/people`, `/api/v1/crm/accounts`, `/api/v1/crm/appointments`, `/api/v1/crm/life-events` — JSON payloads validated with Zod; role-scoped RBAC.
- `GET/POST /api/v1/consent` — Double-opt-in records `{ userId, channel: 'email'|'sms'|'voice', status: 'opted_in'|'opted_out', source, timestamp, proofHash }`.
- `POST /api/v1/privacy/export` → invokes PostgreSQL `export_user_data(user_id)`; `POST /api/v1/privacy/soft-delete` → invokes `soft_delete_user(user_id)`.

### Backend Compliance, Provenance & Orchestration API ↔ Frontend (`M2/M4 ↔ M3`)
- `POST /api/v1/compliance/evaluate` — Runs Gate 1 (PII Redaction & Scope) + Gate 2 (FINRA 2210 / SEC 206(4)-1 Content Guard) + Gate 3 (HITL Escalation check) + Gate 4 (WORM Archive record). Returns `{ allowed, redactedText, violations[], riskDrawerRequired, hitlTicketId?, wormReceiptHash }`.
- `POST /api/v1/calculations/retirement-simulation` — Accepts `paths` (up to `10000`), returns percentile bands (`p10`, `p25`, `p50`, `p75`, `p90`) + `baseIncomeFloor` + `assumptionSource: 'timestamped_api' | 'user_declared_hypothetical'`.
- `POST /api/v1/property/underwrite` — Deterministic PropertyInsight `calcUW` (`hold` | `brrrr` | `str`), 30-yr amortization, 10-yr curves, 2³ DOE stress test, and `.md` Committee Memo export.
- `GET/POST /api/v1/provenance/notebook`, `POST /api/v1/provenance/freeze-plan`, `GET /api/v1/provenance/ro-crate/:sessionId` — Dual-Record Provenance & RO-Crate 1.1 ZIP bundle.
- `POST /api/v1/governance/honeybee/align` & `POST /api/v1/governance/swarm-critic` — Honeybee Democracy household scoring & 4-scout convergence check.
- `GET /api/v1/connectors/status`, `POST /api/v1/connectors/plaid/sync`, `POST /api/v1/connectors/quotes/compare` — Audited connector facades enforcing tier gating, `REMOTE_IP`, and circuit-breaker failover.

### Frontend Shared Components (`M2 ↔ M3`)
- `fiduciary-os/frontend/src/lib/lexicon.ts`: Exports `LEXICON` (10-row mapping), `getLabel(key, surface: 'atlas' | 'command')`, `BANNED_PHRASES`, `APPROVED_VOICE_TERMS`.
- `fiduciary-os/frontend/src/components/RiskDrawer.tsx`: `<RiskDrawer context="..." assumptions={...} />` mounted on every forward-looking chart in M3.
- `fiduciary-os/frontend/src/components/charts/AccessibleChartFrame.tsx`: Wraps all 6 signature charts with ARIA landmarks, Albers/Itten tokens, paired Accessible Data Table toggle/view, and `<RiskDrawer />`.

## Code Layout
- `scripts/env-setup.sh` — Repeatable `/env-setup` script (M0)
- `fiduciary-os/backend/prisma/` — Schema, migrations, PL/pgSQL functions (M1)
- `fiduciary-os/backend/src/routes/` — Express route handlers (M1: `crm.ts`, `consent.ts`, `privacy.ts`, `trust.ts`, `intelligence.ts`; M2: `compliance.ts`; M3: `property.ts`; M4: `orchestration.ts`, `provenance.ts`, `connectors.ts`)
- `fiduciary-os/backend/src/services/` — Domain services (M1: `crmService.ts`, `shapleyService.ts`, `consentService.ts`; M2: `aiGuardrails.ts`, `complianceGates.ts`; M3: `propertyUnderwriting.ts`; M4: `dualLoopVerification.ts`, `provenanceService.ts`, `skillGovernance.ts`, `honeybeeGovernance.ts`)
- `fiduciary-os/backend/src/orchestration/` — Temporal, LangGraph, Camunda DMN, MCP/A2A spine (M4)
- `fiduciary-os/backend/src/connectors/` — Plaid FDX, iPipeline, ARW, CANNEX, Compulife, Maps/Gemini 4, Auth0/Argon2id/KMS, Twilio/SES (M4)
- `fiduciary-os/frontend/src/lib/` — `lexicon.ts`, `onboardingMachine.ts` (M2)
- `fiduciary-os/frontend/src/components/` — `RiskDrawer.tsx`, `HouseholdCheckup.tsx`, `OnboardingWizard.tsx`, `StewardPortal.tsx` (M2); `charts/*` (M3)
- `fiduciary-os/frontend/scripts/` — `check-copy-lexicon.mjs` (M2), `check-chrome-styles.mjs`, `check-funnel-styles.mjs`
- `fiduciary-os/e2e/` — Independent opaque-box E2E test suite (E2E Track)
- `trust-core/` — Deterministic math engines & durable evidence ledger (M0, M1, M3)
- Root `*.md`, `07_Scenario_Analysis.csv`, `model/` — Financial model & unified blueprint docs (M5)
