# Milestone M2 Briefing (`sub_orch_m2`)

- **Milestone**: M2 — Bifurcated Lexicon, Automated Copy Linter, 4 Runtime Compliance Gates & 5-Stage XState Household Flow
- **Parent Conversation ID**: `67b40cdf4d4adda8649ca02e12ff35f8`
- **Project Root**: `/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint`
- **State Folder**: `/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/.agents/teamwork/sub_orch_m2`
- **Prior Baseline**: M1 (`PASS`) — 14/14 backend suites (110/110 tests), 7/7 trust-core tests, 110/110 frontend Vitest tests.

## Deliverables
1. **Pillar 1 — Bifurcated Plain-Language Lexicon & Copy Linter (`fiduciary-os/frontend/`)**:
   - `src/lib/lexicon.ts`: 10-row Bifurcated Plain-Language Lexicon (`atlas` consumer vs. `command` advisor), H1 tagline `"Build a Future for Your Family, One Step at a Time."`, 9 approved Sage-and-Caregiver voice terms, `BANNED_PHRASES` (6 promotional phrases + legacy static claim bans).
   - `scripts/check-copy-lexicon.mjs` + `"lint:copy"` script in `package.json`: scans consumer-facing UI source/copy for banned promotional phrases, legacy unsourced static ratios, and advisor-jargon leaks into B2C surfaces; exits non-zero on violations.
   - `src/components/RiskDrawer.tsx`: persistent educational disclaimer + expandable SEC Marketing Rule 206(4)-1 Risk Drawer.
   - CAN-SPAM / TCPA / GDPR / CCPA double-opt-in Consent preferences UI wired to `GET/POST /api/v1/consent`.
2. **Pillar 2 — Continuous 5-Stage Lifecycle Flow, 6-Step XState Wizard & Live CRM Wiring (`fiduciary-os/frontend/`)**:
   - Install `xstate` + `@xstate/react`.
   - `src/lib/onboardingMachine.ts`: deterministic XState v5 state machine for 5-stage lifecycle + 6-step Onboarding Wizard.
   - 5 continuous stages:
     1. `Discover & Orient`: `src/components/HouseholdCheckup.tsx` (zero-login 3-Slider Household Checkup, zero PII).
     2. `Learn & Assess`: `src/components/OnboardingWizard.tsx` (6-step XState Wizard + 5-min interactive micro-lessons paired with calculators).
     3. `Map & Model`: Household Wealth Canvas & 11 coupled studios navigation shell in `App.tsx` / `ExpandedModules.tsx` (including slot for Studio #11 Real Property & Tangible Asset Studio).
     4. `Verify & Escalate`: Quorum & Human Handoff panel with persistent `"Talk to a Licensed Advisor"` CTA.
     5. `Steward & Transfer`: `src/components/StewardPortal.tsx` (Multi-Generational Portal & Mobile Policy/Task Tracker with collapsible accordions).
   - Wire `AdvisorCrmAndResearch.tsx` to live PostgreSQL CRM APIs (`/api/v1/crm/{households,people,accounts,appointments,life-events}`) with graceful fallback.
   - Update `AdvisorCommandCenter.tsx` (including L655) and all frontend files to remove `MASTERNEX Core` / `masternex-mcp` and reflect native PostgreSQL Provenance / Shapley status.
3. **Pillar 5 — 4 Runtime Compliance Gates (`fiduciary-os/backend/`)**:
   - Upgrade `src/services/aiGuardrails.ts` and create `src/services/complianceGates.ts` + `src/routes/compliance.ts` (mounted at `/api/v1/compliance` in `src/index.ts`):
     - Gate 1: PII Redaction & Scope Gate (strips SSNs/account numbers pre-LLM + RBAC tool allowlist enforcement).
     - Gate 2: FINRA 2210 / SEC 206(4)-1 Content Guard (blocks guarantee claims, banned phrases, individualized recommendations; injects risk disclosures & `riskDrawerRequired: true`).
     - Gate 3: HITL Escalation Pause (queues suitability/replacement/tax/high-stakes outputs for named advisor sign-off with persistent ticket ID & `POST /api/v1/compliance/hitl/:id/resolve`).
     - Gate 4: Dual-Record 7-Year S3 Object Lock WORM Archiving interface (records immutable hash-chained receipt into PostgreSQL `provenance_records` + S3 Object Lock WORM metadata envelope).
   - Expose `POST /api/v1/compliance/evaluate`, `GET /api/v1/compliance/hitl`, `POST /api/v1/compliance/hitl/:id/resolve`.
   - Unit & integration tests in `fiduciary-os/backend/tests/unit/compliance-gates.test.ts` and frontend Vitest suites.
