# M5 Blueprint Explorer Handoff (`m5_explorer_blueprint`)

**Scope:** Read-only architecture synthesis and line-numbered implementation plan for:
1. New canonical master blueprint: `UNIFIED_PLATFORM_BLUEPRINT.md` (repo root)
2. Line-numbered updates to `VALUE_FLOW_AND_REPO_ROADMAP.md`
3. Line-numbered updates to `FIDUCIARY_OS_MASTER_INDEX.md`

**Verified Alignment:** Cross-checked against `PROJECT.md`, `Unit_Economics.md` (v2.0), `FINANCIAL_MODEL_PACKAGE.md` (v2.0), `04_Income_Statement.csv`, `06_SaaS_Metrics.csv`, `07_Scenario_Analysis.csv`, `.agents/teamwork/spec_miner_survey_3/handoff.md`, and `.agents/teamwork/explorer_survey_1/handoff.md`. Zero arithmetic or architectural contradictions remain.

---

## 1. Audited Baseline Findings

### 1.1 `VALUE_FLOW_AND_REPO_ROADMAP.md` (170 lines)
- **Stale Frontend/Charting Plan (Lines 60–78):** Still recommends Recharts/Tremor and references Chart.js as the legacy plan; omits **Visx 4.0**, **Apache ECharts 6.1**, **D3 layout math (`d3-sankey`, `d3-hierarchy`, `d3-scale`)**, **XState** (6-step onboarding), **WCAG 2.2 AA Accessible Data Tables**, **Albers/Itten palette** (`#1B365D`, `#2E6F5E`, `#C27D2C`, `#B83A3A`), 220ms `cubic-bezier(0.16, 1, 0.3, 1)` transitions, and automated `lint:copy`.
- **Stale Platform/Connector Stack (Lines 104–118):** Mentions `plaid/quickstart` generically without event-driven **Plaid FDX (`/transactions/sync` cursors)** or Free-tier caps; omits **PostgreSQL 16 + `pgcrypto` Household Graph CRM**, **iPipeline Novera/OneView™**, **Annuity Rate Watch / Wink**, **CANNEX**, **Compulife (`REMOTE_IP` + US/CA Auth IDs)**, **Google Maps `AdvancedMarkerElement` + Gemini 4 Interactions**, **Auth0/OIDC + PKCE + Argon2id + AWS KMS**, and **Twilio + SendGrid/SES**.
- **Stale AI/Trust Layer (Lines 121–133):** Omits **Temporal + LangGraph + Camunda DMN + MCP/A2A**, **K-Dense Dual-Loop Verification & Dual-Record Provenance + RO-Crate 1.1**, **`cisco-ai-skill-scanner` vetted `claude-skills-mcp`**, **Biomimicry 3.8 + Honeybee Democracy 4-Scout Swarm Critic**, and the **4 Runtime Compliance Gates + 7-Year S3 Object Lock WORM + PostgreSQL Merkle Hash Chain**.
- **Stale Phased Plan (Lines 149–160):** Uses old Phase 0–4 table that does not match the Unified Blueprint's Phases 1–4 (Months 1–6, Months 7–15, Months 16–24, Years 3–5) and lacks **Flagger canary promotion criteria** (10% traffic, 30s health interval, automatic rollback if error rate > 1% or p95 latency > 500ms).
- **Incomplete "Not Recommended" Table (Lines 163–170):** Needs explicit entries banning **`MASTERNEX.os`** (FINRA 24-09 vendor-supervision risk, zero CRM entities), **unsourced static marketing ratios** (`1.25x Leverage Factor`, unsourced `11.10%` FIA payout), and **unbounded Free-tier Plaid background polling** (negative gross margin inversion).

### 1.2 `FIDUCIARY_OS_MASTER_INDEX.md` (269 lines)
- **Old Identity Framing (Lines 1–19):** Describes only "Advisor Command Center (B2B)" + `"My Financial Life" Portal (B2C)` rather than the unified **AUCTUM.ATLAS** (Consumer / Household Portal) + **AUCTUM Command (powered by Fiduciary OS™)** (Licensed Advisor & Compliance Core).
- **Missing Master Blueprint Link (Lines 24–38, 73–91):** Does not list `UNIFIED_PLATFORM_BLUEPRINT.md` or `VALUE_FLOW_AND_REPO_ROADMAP.md` in the documentation tables.
- **Reconciled Financials Check (Lines 36, 56–67, 174–176):** Already matches v2.0 Base Case (`$19.95M` ARR / `$21.05M` Revenue / `$1.99M` EBITDA; Solo `$4,950` / `9.9×`, Growth `$14,950` / `10.0×`, Enterprise `$120,000` / `15.0×`, B2C `$255` / `8.5×`). Needs a concise cross-reference note explaining the 3-way Year 5 Revenue reconciliation (Pure-SaaS Base `$21.05M` vs. Legacy v1 Reference `$28.02M` vs. Gated Licensed-Partner Upside `$51.7M`).
- **Stale Tech Stack & Repo Tree (Lines 94–139):** Still lists `React 18`, `Chart.js`, `Zustand`, and `All 10 Navigator modules` instead of `React 19`, `Vite 8`, `TypeScript 7`, `XState`, `Visx 4.0`, `Apache ECharts 6.1`, `D3 layout math`, `Google Maps AdvancedMarkerElement`, `11 coupled studios` (10 Navigators + Real Property Studio #11), `trust-core/`, and `MASTERNEX.os` removal.
- **Stale Product Roadmap (Lines 190–218):** Uses Months 1–6 / 7–12 / 13–18 / 19–24 instead of Unified Phases 1–4 (Months 1–6, Months 7–15, Months 16–24, Years 3–5) with Flagger canary criteria and the 5 Founder Decisions.
- **Version History (Lines 253–259):** Ends at v1.1 (October 2026); needs v2.0 (November 2026).

### 1.3 Verified Financial Reconciliation (Zero Contradictions)
Verified directly from `Unit_Economics.md` (lines 11–19), `04_Income_Statement.csv` (lines 3–5, 11, 22), `06_SaaS_Metrics.csv` (lines 3–5, 15–30), `07_Scenario_Analysis.csv` (lines 3–15), and `FINANCIAL_MODEL_PACKAGE.md` (lines 11–20, 48–90):

| Segment | Monthly ARPU | Gross Margin | Monthly Churn | LTV (`ARPU×GM÷Churn`) | CAC | LTV/CAC | Payback (`CAC÷(ARPU×GM)`) |
|---|---|---|---|---|---|---|---|
| **Solo** | `$99` | `75%` | `1.5%` | **`$4,950`** | `$500` | **`9.9×`** | `6.73 mo` (`6.7 mo`) |
| **Growth** | `$299` | `75%` | `1.5%` | **`$14,950`** | `$1,500` | **`10.0×`** (`9.97×`) | `6.69 mo` (`6.7 mo`) |
| **Enterprise** | `$1,500` | `80%` | `1.0%` | **`$120,000`** | `$8,000` | **`15.0×`** | `6.67 mo` (`6.7 mo`) |
| **B2C Premium** | `$15` | `85%` | `5.0%` | **`$255`** | `$30` | **`8.5×`** | `2.35 mo` (`2.4 mo`) |

**Year 5 Revenue & ARR Reconciliation Table (must appear verbatim in `UNIFIED_PLATFORM_BLUEPRINT.md`):**
| Case | Year 5 ARR | Year 5 Total Revenue | Year 5 EBITDA | Governance / Licensing Status |
|---|---|---|---|---|
| **v2.0 Pure-SaaS Conservative (70%)** | `$13.96M` (`$13,963,875`) | `$14.73M` (`$14,734,999`) | `−$3.06M` (`−$3,061,303`) | Active v2.0 model (`07_Scenario_Analysis.csv`); zero placement rev-share |
| **v2.0 Pure-SaaS Base Case (Canonical)** | **`$19.95M`** (`$19,948,393`) | **`$21.05M`** (`$21,049,999`) | **`$1.99M`** (`$1,990,697`) | **Canonical active model** (`04_Income_Statement.csv`, `06_SaaS_Metrics.csv`); B2B `$8.90M` + B2C `$12.15M` |
| **v2.0 Pure-SaaS Optimistic (140%)** | `$27.93M` (`$27,927,750`) | `$29.47M` (`$29,469,999`) | `$8.73M` (`$8,726,697`) | Active v2.0 model (`07_Scenario_Analysis.csv`); zero placement rev-share |
| **Legacy v1 Base Reference (Superseded)** | `$19.95M` | `$28.02M` | — | **Superseded** (`$21.05M` SaaS + `~$6.97M` excluded unlicensed insurance rev-share); retained for audit trail only |
| **Gated Licensed-Partner Upside Case** | — | **`$51.7M`** | — | **Non-base strategic upside**; strictly gated on written securities/insurance counsel opinion, named licensed agency/BD channel partner, and compliant non-commission fee structure |

---

## 2. Exact Section-by-Section Blueprint for `UNIFIED_PLATFORM_BLUEPRINT.md`

Create `/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/UNIFIED_PLATFORM_BLUEPRINT.md` with the following 9 sections:

### Section 0: Document Header & Executive Summary
- Title: `# Unified Platform Blueprint: AUCTUM.ATLAS & AUCTUM Command (Fiduciary OS™)`
- Version `2.0` | Date `November 2026` | Status `Canonical Architecture Specification`
- Executive summary explaining the resolution of the structural split between **AUCTUM.ATLAS** (consumer/household plain-language stewardship portal) and **AUCTUM Command (powered by Fiduciary OS™)** (licensed advisor & compliance core), underpinned by deterministic calculation engines (`trust-core/`), PostgreSQL 16 + `pgcrypto` CRM (decommissioning `MASTERNEX.os`), WCAG 2.2 visualization, K-Dense Dual-Loop verification, Temporal/LangGraph/Camunda DMN orchestration, and audited connectors.
- High-level Mermaid architecture diagram showing the dual-sided surfaces → 4 Compliance Gates → Orchestration Spine → 11 Coupled Studios + Trust-Core + PostgreSQL/S3 WORM + Audited Connectors.

### Section 1: Pillar 1 — Bifurcated Plain-Language Lexicon, Brand Voice & Regulatory Framing
- **Sage-and-Caregiver Voice & H1 Tagline:** `"Build a Future for Your Family, One Step at a Time."` + 9 approved voice terms (*stewardship, legacy, foundation, roadmap, nurture, clarity, resilience, goals, education*).
- **Exact 10-Row Bifurcated Lexicon Table** (Platform Concept | Legacy Fiduciary OS | `AUCTUM.ATLAS` Household Copy | `AUCTUM Command` Advisor Copy — verbatim from `spec_miner_survey_3/handoff.md` §2.1).
- **Automated Copy & Compliance Linting (`lint:copy` / `check-copy-lexicon.mjs`):**
  - 6 banned promotional phrases: `"get rich fast"`, `"Act now!"`, `"your nest egg is doomed"`, `"investment vehicles"`, `"beat the market"`, `"guaranteed growth"`.
  - Legacy unsourced claims banned: `"1.25x Leverage Factor"`, `"Tax Windfall"`, `"Complete Principal Preservation"`, unsourced `"11.10%"` FIA payout.
  - Brand hygiene rules: no B2B advisor jargon leaking to B2C surfaces; AUCTUM forbidden strings (`Luminall`, `Property Insight`, `Vivella`, `Verified partner`, `group sell`, unqualified `"verified"`).
- **Regulatory Framing Controls:**
  - Persistent educational disclaimer on all consumer calculators (*"General educational illustration; not personalized investment, tax, or legal advice"*).
  - Inline **SEC Marketing Rule 206(4)-1 Risk Drawer** mounted on every forward-looking chart.
  - **FINRA Rule 2210** fair-and-balanced guardrails.
  - **CAN-SPAM, TCPA & GDPR/CCPA Consent Ledger** (`ConsentRecord` table with double-opt-in proof hash, 10-day opt-out SLA, hard dispatch block on SendGrid/SES & Twilio without active opt-in).

### Section 2: Pillar 2 — End-to-End 5-Stage Lifecycle Flow, 11 Coupled Studios, 7 Surfaces & PostgreSQL CRM
- **Continuous 5-Stage Household Lifecycle:**
  1. **Discover & Orient:** Zero-login 3-Slider Household Checkup (monthly take-home, target retirement age, dependents; zero PII).
  2. **Learn & Assess:** 6-step deterministic **XState** Onboarding Wizard (`≤10` steps) + 5-minute interactive micro-lessons paired with calculators.
  3. **Map & Model:** Household Wealth Canvas + **11 Coupled Studios** (10 original Fiduciary OS Navigators + **Studio #11: Real Property & Tangible Asset Studio** adapted from `AUCTUM.Insights` / PropertyInsight AI supporting Buy & Hold, BRRRR, and STR, 30-yr amortization, 10-yr equity/cash-flow curves, 2³ DOE stress test, Google Maps `AdvancedMarkerElement`, Gemini 4 Interactions, and 1-click `.md` Committee Memo export), synchronized via the Unified Cash-Flow Router.
  4. **Verify & Escalate:** Quorum & Human Handoff, persistent `"Talk to a Licensed Advisor"` CTA, Temporal HITL approval queue.
  5. **Steward & Transfer:** Multi-Generational Portal & touch-optimized Mobile Policy/Task Tracker (fed by iPipeline OneView™).
- **7 Platform Surfaces:** (1) Public Homepage, (2) Onboarding & Learning Hub, (3) Household Wealth Canvas, (4) Real Property & Tangible Asset Studio, (5) Advisor Command Center (wired to live Postgres CRM), (6) Outreach & Compliance Hub, (7) Mobile Policy & Task Tracker.
- **PostgreSQL 16 + `pgcrypto` + `pgvector` Household Graph CRM (Decommissioning `MASTERNEX.os`):**
  - Core entities: `Household`, `Person`, `HouseholdMember` (multi-gen roles: `parent_of`, `trust_beneficiary`, `power_of_attorney`), `CrmAccount`, `Appointment`, `LifeEvent`, `ConsentRecord`, and append-only Merkle-chained `ProvenanceRecord` (`pg_advisory_xact_lock`, RLS/triggers blocking `UPDATE`/`DELETE`/`TRUNCATE`).
  - Column-level AES-256-GCM SSN encryption via `pgcrypto` + AWS KMS.
  - PL/pgSQL privacy routines: `export_user_data(user_id)` (30-day GDPR/CCPA JSON portability) and `soft_delete_user(user_id)` (PII & Plaid token scrubbing while preserving statutory WORM audit metadata).
  - Explicit decommissioning record for `MASTERNEX.os` (0 CRM entities; FINRA 24-09 vendor-supervision risk; all 7 env-gated endpoints replaced natively).

### Section 3: Pillar 3 — WCAG 2.2 Visualization System & 6 Signature Interactive Charts
- **Technology Stack:** **Visx 4.0** (SVG/React primary, `@visx/a11y`, ~15 KB modular) + **Apache ECharts 6.1** (Canvas/LTTB 10,000-path simulations & parallel coordinates) + **D3 layout math** (`d3-sankey`, `d3-hierarchy`, `d3-scale`) + **Google Maps `AdvancedMarkerElement`** (with local-first fallback).
- **WCAG 2.2 AA & Visual Design Contract:**
  - Mandatory paired **Accessible Data Table** on every chart (WCAG 1.1.1, 1.4.1, 1.4.11 ≥3:1 non-text contrast, 2.1.1 full keyboard navigation).
  - **Albers/Itten Palette:** `#1B365D` (Navy — foundation/principal), `#2E6F5E` (Sage — resilience/growth), `#C27D2C` (Amber — caution/trade-offs), `#B83A3A` (Crimson — deficits/gaps only), paired with dashed strokes and direct labels so color is never the sole channel.
  - Motion & Typography: `220ms cubic-bezier(0.16, 1, 0.3, 1)` transitions (respecting `prefers-reduced-motion`), `font-variant-numeric: tabular-nums`.
- **6 Signature Interactive Charts Table:**
  1. **Household Cash-Flow & Legacy Canopy** (Visx + `d3-sankey` + Compound Ribbon: 5/10/20/30-yr projections + GUL multiple).
  2. **10,000-Path Longevity & Withdrawal Confidence Fan** (ECharts 6.1 `sampling: 'lttb'`, 10th/25th/50th/75th/90th percentiles + Base Income Floor).
  3. **Fee-Drag Divergence & Compounding Recovery Area** (Visx dual-curve: e.g. `$1M` at 0.75% vs. 0.03% over 10/20/30 years).
  4. **Multi-Generational Household & Beneficiary Constellation** (Visx + `d3-hierarchy`, shape+icon gap alerts).
  5. **Real Property Equity, Amortization & Spatial Cluster Map** (Canvas + Google Maps `AdvancedMarkerElement`).
  6. **Multi-Carrier Protection & Efficiency Frontier** (ECharts 6.1 Parallel Coordinates: Annual Premium, Benefit/Premium Multiple, Liquidity, Chronic Illness, LTC).
- **Static Ratio Ban:** Hard-disable unsourced static marketing ratios (`1.25x Leverage Factor`, unsourced `11.10%` FIA payout); every chart must declare `assumptionSource: 'timestamped_api' | 'user_declared_hypothetical'` and mount `<RiskDrawer />`.

### Section 4: Pillar 4 — K-Dense Dual-Loop AI, Provenance, Vetted Skills & Nature-Inspired Governance
- **K-Dense Dual-Loop Verification:** Outer Planning Loop (Initial Planning → Orchestrator → Planning Review) + Inner Implementation Loop (Coding Planning → Sandboxed Python/Deterministic Execution → Coding Review + Math/Compliance Critic). Zero LLM mental math in prose.
- **Dual-Record Provenance:** Agent-written **Living Lab Notebook** + unforgeable host-observed **Provenance Log** + SHA-256 hash-chained **Frozen Analysis Plan** + 2–16 sensitivity runs + checksummed **RO-Crate 1.1 ZIP** WORM export.
- **Vetted `claude-skills-mcp` & `mimeo` Governance:** Pre-deployment behavioral security scan (`cisco-ai-skill-scanner --use-behavioral`), allowlisted MCP skill tools (`docx`/`pdf`/`pptx`/`xlsx` sourced from `anthropics/skills`), `K-Dense-AI/mimeo` strictly restricted to read-only pedagogy checklists in the Learning Hub.
- **Biomimicry 3.8 Life's Principles & Honeybee Democracy:**
  - 6 Life's Principles mapped to software (Multi-Constraint Cash-Flow Solver, Guardrail Retirement & 95% VaR Stress Studio, Life-Event Attunement, Scaffolded Literacy, Data Minimization/`soft_delete_user`, Collective Consensus).
  - **Honeybee Democracy Household Alignment Mode** (independent spouse/heir scoring before merge) + **4-Scout Swarm Critic Gate** (non-convergence automatically escalates to human advisor HITL).

### Section 5: Pillar 5 — Audited Connector Economics, Orchestration Spine & 4 Runtime Compliance Gates
- **Audited Connector Matrix:**
  - **Plaid FDX:** Event-driven `/transactions/sync` cursors only; **Free tier** capped at manual/CSV/1 user-refreshed checking account (or Sandbox); multi-institution aggregation gated to **B2C Premium (`$15/mo`)** & **Advisor seats** to prevent negative gross margin; failover to MX/Finicity/TimescaleDB; strict rate limits (100 req/day/Item, 5/min Balance).
  - **Insurance & Annuity:** **iPipeline Novera API Hub & OneView™** (annuity order/AFFIRM suitability/live status), **Annuity Rate Watch API** (failover to Wink, Inc.), **CANNEX** (Phase 4 US/Canada income annuities & RRIFs), **Compulife API** (`$490/yr` 1,200/mo, `$985/yr` 6,000/mo, `$1,540/yr` 30,000/mo; single server IP lock; mandatory `REMOTE_IP` anti-scraping param with 24h lockout; separate US/CA Auth IDs).
  - **Spatial & Grounding:** **Google Maps Platform** (`importLibrary`, `AdvancedMarkerElement`, `PlaceAutocompleteElement`) + **Gemini 4 Interactions** (`POST /v1beta/interactions`, `Api-Revision: 2026-05-20`, `previous_interaction_id`, `thinking_level`, live `google_search` + `google_maps` citations).
  - **Identity, Crypto & Messaging:** **Auth0/OIDC + PKCE + MFA** (15m access / 7d refresh), **Argon2id** (`64 MB, t=3, p=4, 32-byte salt`), **AWS KMS + `pgcrypto` AES-256-GCM**, TLS 1.3 ECDSA P-256 (90d rotation), **Twilio + SendGrid/AWS SES** (gated by Consent Ledger).
- **Layered Stateful Orchestration Spine:**
  - **Temporal** (Outer Durability Spine; payloads `> 2 MB` persisted to encrypted AWS S3 with compact UUID refs to respect Temporal's 2 MB gRPC payload limit).
  - **LangGraph** (Bounded Inner Reasoning Graph inside Temporal activities).
  - **Camunda DMN** (Deterministic regulatory decision tables: state suitability, RMD/Medicare eligibility, banned-word rules).
  - **MCP & A2A** (Model-agnostic tool and agent interoperability).
- **4 Runtime Compliance Gates (FINRA 24-09, proposed Notice 26-14, SEC 17a-4(f), FINRA 4511, SEC 204-2, CFTC 1.31):**
  1. **Gate 1 — PII Redaction & Scope Gate:** Strips SSNs/account numbers pre-LLM + enforces RBAC tool allowlists.
  2. **Gate 2 — FINRA 2210 / SEC 206(4)-1 Content Guard:** Blocks guarantee claims/individualized recs, injects required risk disclosures.
  3. **Gate 3 — HITL Escalation Pause:** Temporal durable pause queuing suitability, replacement, or tax-strategy outputs for named licensed advisor sign-off.
  4. **Gate 4 — Dual-Record 7-Year WORM Archiving:** AWS S3 Object Lock (Compliance mode, 7-year retention) + PostgreSQL Append-Only Merkle Hash Chain + `export_user_data` / `soft_delete_user`.

### Section 6: Pillar 6 — Reconciled Unit Economics & Year 5 Financial Model Alignment
- Include the exact verified **Unit Economics Table** (Solo `$4,950` / `9.9×`, Growth `$14,950` / `10.0×`, Enterprise `$120,000` / `15.0×`, B2C Premium `$255` / `8.5×`) and **Year 5 Revenue & ARR Reconciliation Table** from §1.3 above.
- Explicitly note that `Unit_Economics.md` v2.0, `04_Income_Statement.csv`, `06_SaaS_Metrics.csv`, `07_Scenario_Analysis.csv`, and `FINANCIAL_MODEL_PACKAGE.md` v2.0 are generated reproducibly by `model/build_model.py` and are the canonical financial truth.

### Section 7: Phased Rollout Roadmap (Phases 1–4) & Flagger Canary Governance
- **Flagger Progressive Delivery Gate (Mandatory Across All Phases):**
  - Canary traffic step: **10%** initial canary weight.
  - Health check interval: **30 seconds**.
  - Automatic rollback triggers: **HTTP 5xx / error rate > 1.0%** OR **p95 latency > 500 ms** (plus zero tolerance for compliance-gate failures).
- **Exact 4-Phase Rollout Table:**
  - **Phase 1 — Foundation & Trust Core (Months 1–6):** Trust Core durable ledger, WCAG 2.2 AA Design System (Visx 4.0 + ECharts 6.1 + Accessible Data Tables), 6-step XState onboarding + 3-Slider Checkup, PostgreSQL 16 + `pgcrypto` Household Graph CRM (Masternex decommissioned), Family Document Binder (Argon2id + OAuth 2.0 PKCE + S3 Object Lock), 2 core literacy studios (Budgeting & Fee Recovery, Retirement Guardrails), Compulife pilot (`$490/yr`), Plaid Trial (`≤10` Prod Items), 25+ discovery interviews.
  - **Phase 2 — Multi-Studio Coupling & Live Connectors (Months 7–15):** Unified Cash-Flow Router linking Tax, Retirement, Life Insurance + **Studio #11 Real Property & Tangible Asset Studio** (Google Maps `AdvancedMarkerElement`), Annuity Rate Watch (Wink failover) + iPipeline Novera/OneView™, event-driven Plaid FDX (B2C Premium & Advisor seats only), FINRA 2210 / CAN-SPAM / TCPA pre-flight linter on Twilio & SendGrid/SES.
  - **Phase 3 — Durable AI Orchestration & Swarm Verification (Months 16–24):** Temporal + LangGraph + Camunda DMN spine (S3 UUID refs for `>2 MB` payloads), K-Dense Dual-Loop AI Coach + Frozen Analysis Plan + Provenance Log + RO-Crate 1.1 WORM export, vetted `claude-skills-mcp` (`cisco-ai-skill-scanner --use-behavioral`), Gemini 4 Interactions grounding, Honeybee Democracy Household Alignment Mode & 4-Scout Swarm Critic Gate.
  - **Phase 4 — Cross-Border Scale & Multi-Generational Ecosystem (Years 3–5):** CANNEX Canadian expansion (RRIFs & Canadian payout annuities, separate Compulife CA Auth ID), 3-generation Household Constellations + NextGen Heir literacy tracks, audited MCP/A2A/REST APIs for CPA & estate-attorney collaboration under 7-year WORM & regional data residency.

### Section 8: Five Immediate Founder Decisions (with Decision #5 Audit Resolution)
Present as an actionable decision table with **Decision, Options, Recommended Default, Economic/Regulatory Rationale, and Status**:
1. **Decision #1 — Primary Launch Wedge:** B2B-First Advisor-Sponsored (`$99–$299/mo` seats absorb `$1,000+/mo` Plaid base minimums and anchor compliance distribution) vs. Direct-to-Family B2C. *Recommended:* B2B-First Advisor-Sponsored with free B2C educational wedge.
2. **Decision #2 — CRM Core:** Custom PostgreSQL 16 + `pgcrypto` Household Graph CRM vs. Managed Third-Party CRM. *Recommended:* Custom PostgreSQL + `pgcrypto` Household Graph (full multi-gen modeling, zero vendor lock-in, native `export_user_data`/`soft_delete_user`, FINRA 4511 alignment).
3. **Decision #3 — AI Coach Agency Policy:** Deterministic Educational Interpreter over sandboxed Python + Camunda DMN + HITL vs. Autonomous Recommender. *Recommended:* Deterministic Educational Interpreter with mandatory HITL escalation for suitability/replacement/tax actions.
4. **Decision #4 — Financial Literacy Curriculum:** Proprietary 5-minute micro-lessons (anchored to SEC Investor.gov & CFP Board standards) vs. Third-Party Licensing. *Recommended:* Proprietary 5-minute micro-lessons governed by read-only `mimeo` pedagogy checklists.
5. **Decision #5 — Restricted Source Verification & `MASTERNEX.os` Decommissioning (AUDITED & RESOLVED):**
   - **Audit Result:** Verified via live `gdrive` CLI that Google Drive folder `15lAFlPFTUTNs0uymgE_iBJ8yickAAWU2` (`Fiduciary OS`) **is accessible** and contains **18 legacy `.docx`/Google Docs files** corresponding to the superseded v1 Fiduciary OS documentation suite (`API_Specification.docx`, `Business_Strategy_Plan.docx`, `Competitive_Analysis.docx`, `Database_Design.docx`, `Deployment_Architecture.docx`, `Fiduciary OS B2B Partnership Agreement.docx`, `Fiduciary OS Blog Post`, 2× `Fiduciary OS™ - Master Documentation Index`, `FIDUCIARY_OS_MASTER_INDEX.docx`, `Funding_Strategy.docx`, `Integration_Guide.docx`, `Market_Analysis_Report.docx`, `README.docx`, `Security_Architecture.docx`, `System_Architecture.docx`, `Unit_Economics.docx`, `Valuation_Analysis.docx`).
   - **`MASTERNEX.os` Resolution:** Confirmed `MASTERNEX.os` contains **zero** native CRM entities and introduces FINRA 24-09 vendor-supervision risk; formally **decommissioned** across code, Docker Compose, and architecture in favor of native PostgreSQL 16 + `pgcrypto` CRM, deterministic `trust-core`, Camunda DMN, and K-Dense Provenance.

### Section 9: Cross-Ecosystem Brand Namespace & `@auctum/engine` Governance Note
- **Brand Namespace Conflict & Resolution:**
  - *Conflict:* `Next-Gen Gig Platform Architecture` Tab 2 (`01-brand-architecture.md` / `18-portfolio-expansion.md`) assigns **Atlas** to Tier A Layer 3 (Roofing/Storm Restoration, Atlas Amber `#D08A3E`) and places **Fiduciary OS** in Tier B Layer 4 as an *Independent Portfolio Licensee* (separate data cluster, separate billing, standalone design system, prohibited from displaying the `Verified by AUCTUM` seal at launch). Conversely, `AUCTUM.ATLAS Platform Architecture Redesign` (`1IkLyWtywza5oZcm3l8jkvKKgFh0ap93xzjNOzCdbrT0`) unifies **AUCTUM.ATLAS** (Consumer Family Wealth Portal) + **AUCTUM Command (powered by Fiduciary OS™)** (Licensed Advisor Core) under the Albers/Itten wealth palette (`#1B365D`, `#2E6F5E`, `#C27D2C`, `#B83A3A`).
  - *Governance Resolution for Founder Sign-Off:*
    1. Within this wealth-platform repository, **AUCTUM.ATLAS** designates the Consumer Family Wealth Portal and **AUCTUM Command (powered by Fiduciary OS™)** designates the Licensed Advisor Core.
    2. Maintain **strict Tier B infrastructure & legal isolation** (separate PostgreSQL cluster, separate billing/Stripe tenant, separate KMS key hierarchy, standalone Albers/Itten design tokens, and **no** `Verified by AUCTUM` roofing/gig seal displayed on wealth surfaces).
    3. Before public trademark filing or cross-brand launch, founders must formally ratify whether Roofing/Storm Restoration migrates to a distinct sub-brand (e.g., `AUCTUM.ROOF` / `RoofPro`) so `AUCTUM.ATLAS` remains exclusively the Family Wealth Portal.
- **Optional `@auctum/engine` Field Attestation Governance:**
  - Document the optional future integration hook between **Studio #11 (Real Property & Tangible Asset Studio)** and the zero-dependency `@auctum/engine` verification kernel (11 primitives, 10 invariants `I-1..I-10`, 12 conformance checks `C-01..C-12`, SHA-256 linear chain + RFC 6962 Merkle transparency log + `<5 KB` browser verifier) and `Auctum Vanguard` field capture (`LiteRT` int8 on-device PII redaction, ARCore/IMU spatial binding, Play Integrity API anti-spoofing, RESPA Section 8(a) anti-kickback firewall, TREC Rule 531.20 unlicensed data-entry safe harbor). Strictly opt-in and gated behind legal review; never required for Phase 1–3 launch.

---

## 3. Concrete Line-Numbered Implementation Plan for the Worker

### Step 1: Create `UNIFIED_PLATFORM_BLUEPRINT.md`
- **Target:** `/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/UNIFIED_PLATFORM_BLUEPRINT.md` (new file).
- **Content:** Implement all 9 sections specified in §2 above, ensuring every table, hex color, API endpoint, compliance gate, unit-economics figure, Year 5 reconciliation row, Flagger canary threshold, 5 Founder Decisions (including Decision #5's 18-file Drive audit and `MASTERNEX.os` decommissioning), and Brand Namespace / `@auctum/engine` Governance Note are included verbatim and free of any contradictions.

### Step 2: Update `VALUE_FLOW_AND_REPO_ROADMAP.md` (Line-Numbered Edits)
- **Lines 1–5:** Update title/purpose/snapshot (`November 2026`) to reference the unified **AUCTUM.ATLAS** (Consumer Portal) + **AUCTUM Command (powered by Fiduciary OS™)** (Advisor Core) ecosystem and link to `UNIFIED_PLATFORM_BLUEPRINT.md`.
- **Lines 60–78 (`## 1. Experience & aesthetics`):**
  - Replace `recharts/recharts` (line 71) and `Chart.js plan` with **Visx 4.0** (`@visx/*`, SVG/React primary, `@visx/a11y`), **Apache ECharts 6.1** (Canvas/LTTB 10,000-path simulations & parallel coordinates), **D3.js 7.9** (layout math only: `d3-sankey`, `d3-hierarchy`, `d3-scale`), and **XState** (6-step deterministic onboarding).
  - Update **Design direction** (line 77) to specify the WCAG 2.2 AA **Albers/Itten palette** (`#1B365D` navy, `#2E6F5E` sage, `#C27D2C` amber, `#B83A3A` crimson for deficits only), mandatory paired **Accessible Data Tables**, `220ms cubic-bezier(0.16, 1, 0.3, 1)` transitions, `tabular-nums`, and automated `lint:copy` CI gate.
- **Lines 104–118 (`## 3. Platform foundation`):**
  - Add **PostgreSQL 16 + `pgcrypto` + `pgvector` Household Graph CRM** (replacing `MASTERNEX.os`), **Auth0/OIDC + PKCE + Argon2id + AWS KMS**, event-driven **Plaid FDX (`/transactions/sync` cursors, Free-tier cap)**, **iPipeline Novera/OneView™**, **Annuity Rate Watch / Wink**, **CANNEX**, **Compulife (`REMOTE_IP` + US/CA Auth IDs)**, **Google Maps `AdvancedMarkerElement` + Gemini 4 Interactions**, and **Twilio + SendGrid/AWS SES** (Consent-Ledger gated).
- **Lines 121–133 (`## 4. Trust, compliance, and AI safety`):**
  - Add **Temporal + LangGraph + Camunda DMN + MCP/A2A** orchestration spine (noting S3 UUID refs for `>2 MB` payloads), **K-Dense Dual-Loop Verification & Dual-Record Provenance + RO-Crate 1.1**, **`cisco-ai-skill-scanner` vetted `claude-skills-mcp`**, **Biomimicry 3.8 + Honeybee Democracy 4-Scout Swarm Critic**, and **4 Runtime Compliance Gates + 7-Year S3 Object Lock WORM + PostgreSQL Append-Only Merkle Hash Chain + `export_user_data`/`soft_delete_user`**.
- **Lines 149–160 (`## Phased plan`):**
  - Replace the old Phase 0–4 table with the unified **Phases 1–4** (Months 1–6, Months 7–15, Months 16–24, Years 3–5) matching `UNIFIED_PLATFORM_BLUEPRINT.md` §7, and explicitly state the **Flagger canary promotion criteria** (10% traffic, 30s health interval, auto-rollback if error rate > 1% or p95 > 500ms).
- **Lines 163–170 (`## Not recommended`):**
  - Append 3 rows: (1) **`MASTERNEX.os`** (decommissioned — zero CRM entities, FINRA 24-09 vendor-supervision risk; replaced by PostgreSQL 16 + `pgcrypto`), (2) **Unsourced static marketing ratios** (`1.25x Leverage Factor`, unsourced `11.10%` FIA payout — banned in production), (3) **Unbounded Free-tier Plaid background polling** (causes negative gross margin; use `/transactions/sync` cursors gated to Paid/Advisor tiers).

### Step 3: Update `FIDUCIARY_OS_MASTER_INDEX.md` (Line-Numbered Edits)
- **Lines 1–19 (Header & Executive Overview):**
  - Update title/subtitle to `# AUCTUM.ATLAS & AUCTUM Command (Fiduciary OS™) — Master Documentation Index` (`Version 2.0 | Updated: November 2026`).
  - Update Executive Overview to describe the unified dual-sided ecosystem (**AUCTUM.ATLAS** consumer household portal + **AUCTUM Command (powered by Fiduciary OS™)** licensed advisor & compliance core) and link to [`UNIFIED_PLATFORM_BLUEPRINT.md`](UNIFIED_PLATFORM_BLUEPRINT.md).
- **Lines 24–38 (`### 1. Business Strategy & Market Analysis`):**
  - Add **`Unified Platform Blueprint`** (`UNIFIED_PLATFORM_BLUEPRINT.md`) as the first row of the table.
  - Update line 36 (`5-year plan`) to state: `$19.95M ARR / $21.05M pure-SaaS revenue in Year 5 (v2.0 Base Case; excludes legacy v1 $28.02M unlicensed rev-share; $51.7M Licensed-Partner Upside Case gated on legal/channel sign-off)`.
- **Lines 73–91 (`### 3. Technical Architecture`):**
  - Add rows for **`Unified Platform Blueprint`** (`UNIFIED_PLATFORM_BLUEPRINT.md`) and **`Value Flow & Open-Source Upgrade Roadmap`** (`VALUE_FLOW_AND_REPO_ROADMAP.md`).
  - Update **Architecture Highlights** (lines 84–90) to reflect: 5-stage XState household lifecycle & 11 coupled studios (including Studio #11 Real Property & Tangible Asset Studio), Visx 4.0 + ECharts 6.1 WCAG 2.2 visualization layer, PostgreSQL 16 + `pgcrypto` Household Graph CRM (`MASTERNEX.os` decommissioned), Temporal + LangGraph + Camunda DMN + MCP/A2A spine, K-Dense Dual-Loop & Dual-Record Provenance + RO-Crate 1.1, and 4 runtime compliance gates + 7-year S3 Object Lock WORM.
- **Lines 94–139 (`### 4. Production Repository` & `Tech Stack`):**
  - Update `fiduciary-os/` description (line 96) to note `backend/`, `frontend/`, and `trust-core/` (and removal of `MASTERNEX.os`).
  - Update `navigators/` comment (line 114) to `All 11 coupled studios (10 Navigators + Studio #11 Real Property & Tangible Asset Studio)`.
  - Update **Tech Stack** (lines 134–138): Frontend = `React 19, Vite 8, TypeScript 7, XState, Visx 4.0, Apache ECharts 6.1, D3 layout math, Google Maps AdvancedMarkerElement`; Backend = `Node.js, Express, TypeScript, Prisma, PostgreSQL 16 (pgcrypto + pgvector), Redis, Temporal, LangGraph, Camunda DMN`; Trust-Core = `Deterministic math engines, durable cryptographic ledger, MCP server`.
- **Lines 190–218 (`## 🎯 Product Roadmap`):**
  - Align Phases 1–4 with `UNIFIED_PLATFORM_BLUEPRINT.md` §7 (Months 1–6, Months 7–15, Months 16–24, Years 3–5), include the **Flagger canary criteria** (10% traffic, 30s health interval, rollback if error > 1% or p95 > 500ms), and add a pointer to the **5 Founder Decisions & Brand Namespace Governance Note** in `UNIFIED_PLATFORM_BLUEPRINT.md`.
- **Lines 253–259 (`## 📄 Document Version History`):**
  - Add row: `| 2.0 | November 2026 | Unified AUCTUM.ATLAS + AUCTUM Command architecture; added UNIFIED_PLATFORM_BLUEPRINT.md; aligned Phases 1–4 with Flagger canary gates; documented 5 Founder Decisions, MASTERNEX.os decommissioning, and Brand Namespace Governance Note |`.

### Step 4: Verification Checklist for the Worker
After editing, verify:
1. All internal markdown links resolve (`UNIFIED_PLATFORM_BLUEPRINT.md`, `VALUE_FLOW_AND_REPO_ROADMAP.md`, `FIDUCIARY_OS_MASTER_INDEX.md`, `Unit_Economics.md`, `FINANCIAL_MODEL_PACKAGE.md`, `07_Scenario_Analysis.csv`).
2. Zero contradictions on LTV/CAC (`$4,950`/`9.9×`, `$14,950`/`10.0×`, `$120,000`/`15.0×`, `$255`/`8.5×`) or Year 5 figures (`$19.95M` ARR / `$21.05M` Pure-SaaS Base Rev vs. Legacy v1 `$28.02M` vs. Gated Licensed-Partner Upside `$51.7M`).
3. Every required M5 item is present: all 6 pillars, exact 10-row lexicon, 6 signature charts, 4 compliance gates, Flagger canary thresholds (`10%`, `30s`, `>1%`, `>500ms`), Phases 1–4, 5 Founder Decisions (with Decision #5 Drive folder `15lAFlPFTUTNs0uymgE_iBJ8yickAAWU2` 18-file audit & `MASTERNEX.os` decommissioning), and Cross-Ecosystem Brand Namespace + `@auctum/engine` Governance Note.
