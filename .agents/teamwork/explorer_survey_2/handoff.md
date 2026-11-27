# Companion Repositories Survey — Handoff Report (`explorer_survey_2`)

**Executive Summary:** Across the 4 mounted companion repositories, (1) `AUCTUM.atlas` is actually **RoofPro CRM** (storm-intelligence roofing CRM) themed with the **AUCTUM estate design system** (`#F1F2EA` / `#17231D` / `#8C2F22`, Fraunces/Archivo/IBM Plex Mono) and reusable onboarding/trust-ledger patterns — it does **not** contain the household wealth plain-language lexicon or 5-stage wealth flow; (2) `AUCTUM.Insights` delivers a complete **PropertyInsight AI** underwriting, 2³ DOE stress-test, ECharts, spatial/Overpass, and Gemini 4 Interactions engine ready to adapt into the Real Property & Tangible Asset Studio; (3) `k-dense-byok` supplies production TypeScript implementations of **Dual-Record Provenance**, **hash-chained Frozen Analysis Plans**, **RO-Crate 1.1 Reviewer Evidence Packages**, **`/prove-verify` + cross-model `verifierModel` gates**, and **staged Skills/MCP governance**; and (4) `MASTERNEX.os` provides **zero CRM functionality** — `fiduciary-os` only calls 7 env-gated HTTP endpoints (`FiduciaryOSGuard`, underwriting, attested infer, academic search, flight recorder, compliance report, health) + MCP, all cleanly replaceable by native PostgreSQL+pgcrypto, Camunda DMN, K-Dense provenance, and S3 Object Lock WORM.

---

## 1. Observation

### 1.1 `/home/antigravity/marcusdax/AUCTUM.atlas`
- **Actual Product Domain (`README.md:1-16`, `docs/PRODUCT_BRIEF.md:1-10`):**
  - Title: `# RoofPro CRM — Storm-intelligence roofing CRM — the AccuLynx alternative`.
  - Interface note (`README.md:10-12`): *"the UI follows the AUCTUM estate design system — parchment #F1F2EA, ink #17231D, oxblood #8C2F22, 2px geometry and hairline structure, set in Fraunces (display), Archivo (UI) and IBM Plex Mono (data). The product domain (roofing CRM) and all application logic are unchanged."*
  - `rg` across the repo confirmed **no** household wealth plain-language lexicon, no 5-stage `Learn → Map → Model → Verify → Steward` flow, and no financial micro-lessons.
- **Authoritative Visual Design System & Tokens:**
  - `frontend/tailwind.config.cjs:1-145` & `frontend/src/styles/index.css:1-120`:
    - **Brand ground (light parchment default + `[data-theme="dark"]` ink variant):** `--paper: #f1f2ea`, `--paper-deep: #d5dac6`, `--paper-warm: #e9e2d6`, `--ink: #17231d`, `--ink-soft: #2a3a32`, `--navy: #1f2e33`, `--oxblood: #8c2f22`, `--oxblood-dark: #7a1f1f`, `--sage: #526055`, `--gold: #6d592d`, `--gold-bright: #cb8622`.
    - **Status / Seal colors:** `--seal-verified: #27693b`, `--seal-review: #7e5415`, `--seal-flagged: #8c2f22`; hairlines `rgb(23 35 29 / 0.14)` and `rgb(23 35 29 / 0.28)`.
    - **Typography:** Display/Serif `Fraunces`, UI Sans `Archivo`, Mono/Data `IBM Plex Mono`.
    - **Geometry:** Sharp `2px` border radius (`DEFAULT: '2px'`), hairline borders, flat elevation, number+text severity labels (never color alone, `README.md:124`).
  - Note: `frontend/src/design-tokens.json:1-383` is a stale legacy schema (`"ORBITAL INTELLIGENCE Design Tokens"`, dark navy/cyan, Space Grotesk/Inter) superseded by `styles/index.css` and `tailwind.config.cjs`.
- **Reusable Stewardship, Onboarding, Provenance & AI Gateway Patterns:**
  - **AUCTUM Trust Principles (`docs/EXPANSION_CONCEPT.md:19-23`):**
    1. *"No paid rank and no boosts. Badges are earned and never change a price."*
    2. *"Every tool states who it is for, what it costs and its limits ('advisory, not a lab diagnosis')."*
    3. *"Claims go to an append-only record anyone can check."*
  - **Accessible Role-Based Onboarding Tour (`frontend/src/components/onboarding/OnboardingTour.tsx:1-200`, `useOnboarding.ts:1-14`):** 5-step coach-mark Radix Dialog with focus trap, `aria-current="step"`, keyboard-reachable step dots, versioned `localStorage` persistence, and replayable from Settings.
  - **5-Step Resumable Operator Setup (`frontend/src/components/field/FieldPanels.tsx:90-157`):** Resumable multi-step onboarding with SHA-256 agreement hashing.
  - **Provenance & AI Gateway:** C2PA v2.1 + local transparency log (`backend/src/services/field/provenance.ts:66-169`); FreeLLMAPI-compatible multi-provider router with AES-256-GCM encrypted keys and deterministic offline heuristic fallback (`README.md:104-116`, `backend/src/llm/`).

---

### 1.2 `/home/antigravity/marcusdax/AUCTUM.Insights`
- **Repository Contents (`README.md:1-30`):** Standalone **PropertyInsight AI — Hallmark Dusk Edition** (`index.html` = `property_insight_ai_dashboard.html` [1,474 lines], `property_underwriting_widget.html` [203 lines], `property_insight_portfolio_analytics.ipynb` [39 lines], `property_insight_architecture_pack.md` [220 lines]).
- **Core Underwriting, Amortization & 2³ Factorial DOE Engine (`property_insight_ai_dashboard.html:699-778`, `property_underwriting_widget.html:161-174`):**
  - **Data Model (`DEFAULT_PROPERTIES`, lines 699–702):** `{ id, address, beds, sqft, price, rent, downPct, rate, opexPct, rehab, lat, lng }`.
  - **Strategies (`calcUW`, lines 740–765; widget lines 161–174):** `hold` (Buy & Hold), `brrrr` (12% rehab, 1.24x ARV multiplier, +12% rent, 15% down), `str` (Short-Term Rental, 1.55x rent, +14% OpEx capped at 68%).
  - **Math:** Annual NOI, Cap Rate, 30-year monthly debt service (`n=360`), Cash-in, Cash-on-Cash, DSCR (`>=1.25x` ACQUIRE, `>=1.05x` NEGOTIATE, else PASS), 10-year `equitySeries` / `cfSeries` / `debtSeries` (4% appreciation + remaining loan balance), and **2³ Factorial DOE (`computeDOERuns`, lines 766–778 & notebook lines 14–23)** testing 8 combinations of Rate (5.5% vs 7.25%), Rehab ($10k vs $45k), and OpEx (28% vs 38%) with mean/median DSCR and pass count (`>=1.20x`).
- **Apache ECharts Suite (`property_insight_ai_dashboard.html:786-940`):**
  - 6 interactive charts: `echart-10yr` (10-yr equity/cash-flow/debt), `echart-waterfall` (monthly NOI-to-net waterfall), `echart-nights` (30-night occupancy break-even cushion), `echart-radar` (6-pillar underwriting radar: DSCR 25%, Spread 18%, CoC 17%, 2³ DOE 17%, CapEx/Rehab 8%, OSM Location 15%), `echart-doe` (2³ DOE scenario bars), and `echart-masternex` (stacked NADE/GIE/BNE bps attribution). Each chart updates a paired prose explanation panel (`explain-*`).
- **Spatial & Map Stack (`property_insight_ai_dashboard.html:684-698, 945-1170`):**
  - Dual map engine: **MapLibre GL JS** (OpenFreeMap vector styles, 3D building extrusions, cap-rate heatmap `pi-heat-layer`, 0.5mi/1mi/3mi trade-area circle polygons via `createCircleCoords`) + **Leaflet** fallback (Esri Satellite, OpenTopoMap, Carto Dark/Voyager, OSM Standard).
  - Dual geocoder (`geocodeDual`, lines 1107–1143): Photon (`photon.komoot.io`) with Nominatim fallback.
  - Live **Overpass API** POI audit (`scanOverpass`, lines 1145–1170): queries schools, bus stops/rail stations, supermarkets/restaurants/cafes in bounding box; computes `score = min(100, schools*10 + transit*8 + retail*4)` and walkability tier.
  - **Observed Gap vs Pillar 3:** Uses MapLibre GL JS / Leaflet rather than Google Maps `AdvancedMarkerElement`.
- **Gemini 4 Interactions, Multi-Provider AI Studio & AG-UI 1.0 (`property_insight_ai_dashboard.html:674-682, 1232-1328`, `property_insight_architecture_pack.md:165-220`):**
  - **Gemini 4 Interactions API (`line 1308`):** `POST https://generativelanguage.googleapis.com/v1beta/interactions` with `Api-Revision: 2026-05-20`, `model: 'gemini-4-hydrogen'`, and grounded tools `[{ type: 'google_search' }, { type: 'google_maps', latitude: p.lat, longitude: p.lng }]`.
  - **Multi-provider + Deterministic Fallback:** Supports Pollinations OSS, Claude, Gemini 4, Ollama, OpenRouter, Groq, plus `buildQuantFallbackMarkdown` for 4 dossier types (`ic_audit`, `negotiation`, `cma`, `lp_memo`).
  - **AG-UI 1.0 Event Stream (`lines 1324-1328`):** Client-side `emitAgUi(type, payload)` telemetry log.
  - **Schema & Mobile Spec (`property_insight_architecture_pack.md:1-220`):** BigQuery semantic schema (`analytics.dim_property`, `analytics.fact_location_audit`), Flutter companion app layered architecture with Dart 3 pattern-matching JSON parsing, and `google_antigravity` Python orchestrator + `gemini-api` CLI deep-research commands.

---

### 1.3 `/home/antigravity/marcusdax/k-dense-byok`
- **Dual-Record Provenance System:**
  1. **Unforgeable Observational Provenance Log (`docs/provenance.md:1-93`, `server/src/provenance/store.ts:1-200`):**
     - Stored as append-only JSONL at `.kady/provenance/<sessionId>/steps.jsonl`.
     - **Core invariant (`store.ts:9-12`):** Rows are derived strictly from server-side observation of tool events — **the agent has no provenance-authoring tool**.
     - **Typed Confidence & Timing (`store.ts:39-80, 107-159`):** `EdgeConfidence` (`"observed" | "inferred" | "declared"`), `IdentityTiming` (`"write" | "harvest"` — harvest-time hashes can never report `"current"`), `StepRole` (`"agent" | "subagent" | "user" | "compute"`), `DegradeReason` (`"sandbox-too-large" | "scan-failed" | "no-scan-baseline"`), and content-addressed `environmentId` snapshots in `.kady/environments/`.
     - **Visible Degradation Bounds (`docs/provenance.md:68-75`, `store.ts:28-36`):** 20k scanned files, 512 MB/file hash cap (`hashSkipped`), 200 edges/step (`truncatedEdges`), 4 KB args cap.
     - **Version-Aware Lineage (`docs/provenance.md:27-43`):** Traces producing version at-or-before consuming step (max 60 nodes / 12 hops), reports `Current` / `Stale` / `Unverified` and `Changed since use`.
  2. **Living Lab Notebook (`docs/lab-notebook.md:1-115`):**
     - Stored in `.kady/notebook/<sessionId>.jsonl` + `.annotations.json`.
     - Typed entries (`hypothesis`, `method`, `observation`, `decision`, `note`) with evidence links (`supports`, `challenges`, `inconclusive`, `context`), `supersedes` amendments, bounded citation-time file hashes, and pinned `scientific_result` cards.
  3. **Hash-Chained Frozen Analysis Plans (`docs/lab-notebook.md:50-63`, `server/src/agent/notebook-plans.ts:1-115`):**
     - Immutable event files (`000001.json`, `000002.json`..., max 256) published via `fsyncSync` + exclusive `fs.linkSync` (`publish()`, lines 49–70) preventing concurrent overwrite.
     - Strict cryptographic chain (`validateAnalysisPlanRecords`, lines 88–111): verifies `event.sequence === index + 1`, `event.previousDigest === head`, `planDigest(event.source) === planDigest(source)`, `event.actor === "user"`, and `planDigest(unsigned) === digest`. Supports `freeze` revisions and append-only `deviation` events with 15-min preview TTL (`PLAN_PREVIEW_TTL_MS`).
  4. **RO-Crate 1.1 Reviewer Evidence Packages (`docs/evidence-packages.md:1-82`, `server/src/evidence/packages.ts:1-140`, `report.ts:40-61`):**
     - Frozen local ZIP (no model/compute execution) bundling selected notebook records, validated plan journals, provenance, stored environments, version-matched artifact blobs (`.kady/evidence/blobs/<sha256>`), `manifest.json`, `missing-information.md`, `methods-source.md`, `checksums.sha256`, standalone `verify.py` (`python3 -I verify.py`), and base **RO-Crate 1.1 JSON-LD** (`ro-crate-metadata.json` conforming to `https://w3id.org/ro/crate/1.1`).
- **Dual-Loop Verification, Critic Gates & Safety Guards:**
  - **Verification Gate (`docs/sub-agents.md:49-63`):** Brief opens with `"Verification gate:"`; reviewer treats every step/citation as unestablished until independently checked; emits `Verdict: accept | repair | reject` with first failing step; lead never overrules an objection on plausibility.
  - **`/prove-verify` Multi-Round Loop (`docs/sub-agents.md:64-93`):** Parallel `investigator` specialists → domain verifier (`math-checker`, `statistical-reviewer`, `code-reviewer`) + **`comparative-reviewer`** (side-by-side audit catching shared unjustified assumptions and contradictions) → `ledger.md` (`Verified` / `Excluded` / `Attempts`) → fresh final gate + Lab Notebook log.
  - **Cross-Model `verifierModel` (`docs/sub-agents.md:95-118`):** Pins all 15 reviewer roles to a distinct model from the generator via `subagents.agentOverrides.<name>.model`.
  - **Watchdog (`docs/watchdog.md:1-39`):** Optional mid-turn reviewer model checking diffs/transcripts for unreported exclusions, plan deviations, or unsupported claims, with repeated-warning stalemate halt.
  - **Raw-Data Guard (`docs/data-guard.md:1-48`):** Pre-execution read-only protection of `user_data/**` + confirmation gate for destructive shell commands, shared across lead and child specialists via `sandbox/.kady/policy.json`.
- **Skills & MCP Management (`docs/skill-management.md:1-68`, `docs/mcp-servers.md:1-99`):**
  - Dual scope: project (`sandbox/.pi/skills/`) shadows global (`~/.kady/pi-agent/skills/`).
  - Staged preview→install via bundled `skills` CLI into disposable cache; `skills-sync.ts` is the sole live writer (tree hashing, `origin`: `catalogue`/`registry`/`local`, `removed` tombstones, local-edit preservation, no auto-update for user-installed skills, `disable-model-invocation` toggle).
  - MCP (`sandbox/.pi/mcp.json` + global `mcp.json`): `Codemode` (default), `On demand`, `Direct`, `Hidden`; OAuth/Bearer/`${VAR}` env refs; per-specialist allowlist (`mcp:<server>/<tool>`).

---

### 1.4 `/home/antigravity/marcusdax/MASTERNEX.os` (and Active `fiduciary-os` Coupling)
- **What `MASTERNEX.os` Provides (`README.md:1-58`, `ECOSYSTEM_INDEX.md:1-33`, `masternex/auctum/api.py:1-180`):**
  - Sovereign Python/FastAPI cognitive & trust kernel: `ACP-SQL` (SQLite append-only SHA3 hash-chained ledger with Ed25519 + ML-DSA-87 post-quantum signatures), `SovereignShield`, `AI Flight Recorder`, `IronClaw` sandbox, `DTA` Shapley attribution, `PRINCE` federated learning, `Mastermind` experimental LLM, and `masternex mcp` (8 core tools + 3 K-Dense skill tools, `docs/MCP.md:33-65`).
  - **CRM Audit (`rg` across `masternex/`):** `MASTERNEX.os` contains **ZERO CRM tables or lifecycle entities** (no People, Households, Accounts, Appointments, or Life Events). Its only persistence is SQLite (`acp_ledger.db` + `acp_ledger.db.state.db`).
- **Exact Active Runtime Coupling in `fiduciary-os` (`fiduciary-os/backend/src/services/masternexService.ts:1-297`, `kdenseService.ts:4-51`, `aiGateway.ts:130-133`):**
  - All calls are env-gated (`MASTERNEX_API_URL`) and fall back safely when unset.
  - Complete inventory of the 7 HTTP endpoints + 1 MCP registration currently used:
    1. `GET /health` — liveness check (`masternexService.ts:36-55`).
    2. `POST /v1/auctum/fiduciary/evaluate` (`masternexService.ts:61-142` → `MASTERNEX.os/masternex/auctum/suite.py:542-629` `FiduciaryOSGuard`) — Regex education-only copy screen (`_FORBIDDEN_SECURITIES_ADVICE`), PII redaction (`LeakDetector`), deterministic 4-factor exact Shapley attribution in 10,000 bps (`savings_rate_contrib`, `employer_match_contrib`, `low_fee_index_benefit`, `tax_deferral_compounding` + 0.06 synergy), 3-step authorization sequence check (`disclosure_ack` → `input_verified` → `simulation_run`), and signed SR 11-7 receipt appended to `ACPLedger`.
    3. `POST /v1/recorder/events` — AI Flight Recorder digest logging (`masternexService.ts:148-180`).
    4. `GET /v1/compliance/report` — SR 11-7 + EU AI Act status/criteria check (`masternexService.ts:186-206`).
    5. `POST /v1/connectors/infer` — Attested BYOK LLM router with PII redaction (`masternexService.ts:211-242`).
    6. `POST /v1/connectors/academic/search` — Nature/OpenAlex/arXiv/PubMed search (`masternexService.ts:247-270`).
    7. `POST /v1/auctum/insights/underwrite` — Property underwriting bridge (`masternexService.ts:275-296`).
    8. MCP server registration at `MASTERNEX_MCP_URL` (`kdenseService.ts:21, 47-51`).

---

## 2. Logic Chain

1. **Pillar 1 (Brand Voice, Lexicon & Design Tokens):**
   - From Observation 1.1, `AUCTUM.atlas` supplies the **AUCTUM estate visual language** (parchment `#F1F2EA`, ink `#17231D`, oxblood `#8C2F22`, Fraunces/Archivo/IBM Plex Mono, 2px geometry, WCAG number+text severity labels) and the 3 non-negotiable AUCTUM stewardship principles (`docs/EXPANSION_CONCEPT.md:19-23`).
   - However, because `AUCTUM.atlas` is a roofing CRM codebase, the **household financial plain-language lexicon** and **FINRA 2210 / SEC 206(4)-1 copy-linting rules** must be sourced from `ORIGINAL_REQUEST.md` Pillar 1 and the Fiduciary OS / Google Drive blueprint docs — and then unified visually by harmonizing the AUCTUM estate parchment/ink/Fraunces typography with Pillar 3's Albers/Itten WCAG 2.2 chart palette (`#1B365D` / `#2E6F5E` / `#C27D2C` / `#B83A3A`).
2. **Pillar 2 (5-Stage Flow & PostgreSQL + pgcrypto CRM Backbone):**
   - From Observation 1.1, `AUCTUM.atlas/frontend/src/components/onboarding/OnboardingTour.tsx` and `FieldPanels.tsx` provide proven accessible Radix Dialog multi-step onboarding & SHA-256 agreement patterns adaptable to Pillar 2's 6-step XState Onboarding Wizard.
   - From Observation 1.4, `MASTERNEX.os` has **zero CRM entities**, and every `fiduciary-os` dependency on it is already isolated inside `masternexService.ts` + `kdenseService.ts`. Therefore, replacing `MASTERNEX.os` with the PostgreSQL + `pgcrypto` CRM backbone (People, Households, Accounts, Appointments, Life Events) incurs **zero CRM feature loss** and only requires porting the 7 utility/compliance endpoints in `masternexService.ts` to native services.
3. **Pillar 3 (Visualization System & Real Property Studio):**
   - From Observation 1.2, `AUCTUM.Insights` already implements the exact underwriting math (`calcUW`: Buy & Hold / BRRRR / STR, 30-yr amortization, 10-yr equity/CF/debt trajectories, 2³ DOE stress test), 6 ECharts visualizations with paired explanatory narratives, and Overpass POI scoring.
   - Adapting this into Pillar 3's **Real Property & Tangible Asset Studio** (and Signature Chart #5: Real Property Equity, Amortization & Spatial Cluster Map) requires: (a) extracting `calcUW` and `computeDOERuns` into a typed TypeScript/Python deterministic module (removing hardcoded marketing ratios and adding timestamped/user-declared assumption provenance), (b) upgrading the map layer to **Google Maps `AdvancedMarkerElement`** (while optionally retaining MapLibre/OpenFreeMap as a zero-key dev fallback), and (c) pairing every ECharts view with a WCAG 2.2 Accessible Data Table and the Albers/Itten palette.
4. **Pillar 4 (Skills, AI Architecture & Dual-Loop Verification):**
   - From Observation 1.3, `k-dense-byok` already solves the hardest engineering problems in Pillar 4:
     - **Unforgeable Dual-Record Provenance:** Adopt `ProvenanceStep` (`store.ts:126-159`) + `Living Lab Notebook` + `notebook-plans.ts` SHA-256 hash-chained Frozen Analysis Plans + `evidence/packages.ts` **RO-Crate 1.1** ZIP export (`ro-crate-metadata.json` + `checksums.sha256` + `verify.py`).
     - **Dual-Loop Verification & Swarm Critic Gate:** Adopt `k-dense-byok`'s `/prove-verify` loop, `Verification gate:` protocol (`Verdict: accept | repair | reject`), `comparative-reviewer` (ideal base for the Honeybee Democracy Swarm Critic Gate), cross-model `verifierModel`, `Watchdog`, and `Raw-Data Guard`.
     - **Vetted Skills & MCP:** Adopt `skills-fetch.ts` + `skills-sync.ts` staged preview→install (`stagingToken`, manifest v2, `disable-model-invocation`) and `mcp.json` `Codemode`/allowlist governance.
5. **Pillar 5 (Connector Economics, Orchestration Spine & Regulatory Hardening — Masternex Replacement Map):**
   - Combining Observations 1.2, 1.3, and 1.4 yields a complete, lossless replacement for every `masternexService.ts` call:
     - `POST /v1/auctum/fiduciary/evaluate` (`FiduciaryOSGuard`) → **Camunda DMN** + **Gate 1 (PII Redaction & Scope Gate)** + **Gate 2 (FINRA 2210 / SEC 206(4)-1 Content Guard)** + native deterministic TypeScript/Python exact 4-factor Shapley module (20 lines of pure math, no external service needed).
     - `POST /v1/recorder/events` & `ACPLedger` → **K-Dense Observational Provenance (`steps.jsonl` / PostgreSQL append-only hash-chained table)** + **Gate 4 (7-year S3 Object Lock WORM Archiving + RO-Crate 1.1 bundle)**.
     - `GET /v1/compliance/report` → Native SR 11-7 / FINRA 4511 / SEC 206(4)-1 compliance evaluator reading PostgreSQL + WORM archive manifests.
     - `POST /v1/connectors/infer` → Direct BYOK / OpenRouter / Gemini 4 Interactions router (from `AUCTUM.Insights` / `k-dense-byok`) behind Gate 1 PII redaction.
     - `POST /v1/auctum/insights/underwrite` → Native **Real Property & Tangible Asset Studio** service adapted from `AUCTUM.Insights`.
     - `POST /v1/connectors/academic/search` & `masternex mcp` → Direct vetted MCP connectors (e.g., Paperclip / OpenAlex / K-Dense skills via `k-dense-byok` MCP pattern).
6. **Pillar 6 (Unit Economics & Phased Roadmap):**
   - Dropping the standalone `masternex` container from `docker-compose` simplifies infrastructure, removes Python/SQLite dual-persistence overhead, and aligns with the cloud-native PostgreSQL + Temporal + S3 WORM target stack without adding third-party licensing cost.

---

## 3. Caveats

- **`AUCTUM.atlas` Scope:** This repo is RoofPro CRM with the AUCTUM estate theme; household financial lexicon, 5-stage wealth copy, and micro-lesson content were **not** present in this repo and must be verified against `Kimi_Agent_Fiduciary-OS-Business-Blueprint` and the Google Drive `Fiduciary-OS-Ecosystem` folder (handled by peer surveyors).
- **Uninspected Deep Internals:** We did not inspect every line of `AUCTUM.atlas/backend/src/llm/`, `k-dense-byok/server/src/provenance/recorder.ts`, or `MASTERNEX.os/masternex/agents/` (`prove_verify.py`, `arbitration.py`) because the high-level docs, API routers, and `masternexService.ts` already established the complete interface contracts. If post-quantum signing (`ML-DSA-87`) or `MASTERNEX.os/masternex/agents/arbitration.py` consensus math is later desired as a reference, those files can be inspected specifically.
- **Map Renderer Divergence:** `AUCTUM.Insights` uses MapLibre GL JS / Leaflet + OpenStreetMap/Overpass, whereas Pillar 3 & Pillar 5 specify Google Maps Platform `AdvancedMarkerElement` + Gemini 4 Interactions. The Gemini 4 Interactions call (`tools: [{ type: 'google_maps', latitude, longitude }]`) is already present in `AUCTUM.Insights`, but the map widget itself will need an `AdvancedMarkerElement` adapter.
- **Local vs Production Trust Boundary:** `k-dense-byok`'s provenance and RO-Crate packages explicitly note they operate within a local same-user trust boundary (`docs/provenance.md:92`, `docs/evidence-packages.md:77`). For Fiduciary OS Pillar 5 (FINRA 4511), the schema and hash-chaining logic should be backed by server-side PostgreSQL + AWS KMS signing + S3 Object Lock WORM rather than local writable JSONL files.

---

## 4. Conclusion

| Companion Repo | Primary Role in Unified Platform | Concrete Artifacts to Adopt / Adapt | Pillars Mapped |
|---|---|---|---|
| **`AUCTUM.atlas`** | Visual design grammar & UX accessibility reference | AUCTUM estate tokens (`tailwind.config.cjs`, `styles/index.css`: `#F1F2EA` / `#17231D` / `#8C2F22`, Fraunces/Archivo/IBM Plex Mono), AUCTUM stewardship rules (`EXPANSION_CONCEPT.md:19-23`), Radix Dialog `OnboardingTour.tsx`, 5-step resumable setup + SHA-256 agreement (`FieldPanels.tsx`) | Pillars 1, 2 |
| **`AUCTUM.Insights`** | Foundation for Real Property & Tangible Asset Studio | `calcUW` & `computeDOERuns` (Buy & Hold/BRRRR/STR, 30-yr amortization, 10-yr equity/CF, 2³ DOE), 6 ECharts charts + narrative explainers, Overpass POI scoring, Gemini 4 Interactions API (`gemini-4-hydrogen` + `google_search`/`google_maps` tools), Quant deterministic fallback, `dim_property`/`fact_location_audit` schema | Pillars 2, 3, 5 |
| **`k-dense-byok`** | Blueprint for Pillar 4 Verification, Provenance, WORM Export & Skills/MCP | Observational `ProvenanceStep` (`store.ts`), Living Lab Notebook (`lab-notebook.md`), hash-chained Frozen Analysis Plans (`notebook-plans.ts`), RO-Crate 1.1 Evidence Packages (`evidence/packages.ts` + `verify.py`), `/prove-verify` + `comparative-reviewer` + cross-model `verifierModel` + Watchdog + Raw-Data Guard, staged `skills-fetch`/`skills-sync` + MCP `Codemode` | Pillars 4, 5 |
| **`MASTERNEX.os`** | Cleanly decommissionable dependency (zero CRM loss) | Port 7 `masternexService.ts` endpoints (`FiduciaryOSGuard` regex/PII/exact 4-factor Shapley/auth-sequence, flight recorder, compliance report, BYOK infer, underwriting, academic search) into native PostgreSQL+pgcrypto, Camunda DMN, K-Dense provenance, and S3 WORM; drop `masternex` container | Pillars 2, 4, 5, 6 |

---

## 5. Verification Method

To independently verify every claim in this report:
1. **`AUCTUM.atlas` domain & tokens:**
   - Inspect `/home/antigravity/marcusdax/AUCTUM.atlas/README.md:1-16`, `frontend/tailwind.config.cjs:1-96`, `frontend/src/styles/index.css:1-104`, `docs/EXPANSION_CONCEPT.md:19-23`, and `frontend/src/components/onboarding/OnboardingTour.tsx:1-168`.
2. **`AUCTUM.Insights` underwriting, ECharts, Overpass & Gemini 4:**
   - Inspect `/home/antigravity/marcusdax/AUCTUM.Insights/property_insight_ai_dashboard.html` at lines `674-778` (providers/data model/calcUW/DOE), `786-940` (ECharts suite), `1107-1170` (Photon/Nominatim/Overpass), and `1232-1328` (Quant fallback, Gemini 4 Interactions API, AG-UI 1.0), plus `property_insight_architecture_pack.md:165-220`.
3. **`k-dense-byok` provenance, hash-chaining, RO-Crate & verification:**
   - Inspect `/home/antigravity/marcusdax/k-dense-byok/docs/provenance.md`, `docs/lab-notebook.md`, `docs/evidence-packages.md`, `docs/sub-agents.md`, `docs/skill-management.md`, `server/src/provenance/store.ts:24-159`, `server/src/agent/notebook-plans.ts:49-111`, and `server/src/evidence/packages.ts:26-140`.
4. **`MASTERNEX.os` coupling & zero-CRM confirmation:**
   - Inspect `/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/fiduciary-os/backend/src/services/masternexService.ts:1-297` and `/home/antigravity/marcusdax/MASTERNEX.os/masternex/auctum/suite.py:542-629`.
   - Run `rg -n 'crm|appointment|life_event' /home/antigravity/marcusdax/MASTERNEX.os/masternex` (returns 0 matches).
- **Invalidation Conditions:** Any future commit adding household wealth copy to `AUCTUM.atlas`, replacing MapLibre with Google Maps in `AUCTUM.Insights`, or adding new `MASTERNEX.os` endpoints to `fiduciary-os` would require updating the corresponding section.
