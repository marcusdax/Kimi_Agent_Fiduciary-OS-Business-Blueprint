# Milestone M1 Handoff — PostgreSQL + `pgcrypto` Household Graph CRM, WORM/Consent Schema & Masternex Removal

- **Sub-Orchestrator**: `sub_orch_m1`
- **Gate Verdict**: **`PASS`** (Iteration 1 — Strict AND: Auditor `CLEAN` + Primary Reviewer `APPROVE` + Secondary Reviewer `APPROVE` + Challenger `CONFIRMED`)

## Deliverables Implemented

### 1. PostgreSQL + `pgcrypto` Schema & PL/pgSQL Privacy/Audit Routines
- **[`fiduciary-os/backend/prisma/schema.prisma`](file:///home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/fiduciary-os/backend/prisma/schema.prisma)**:
  - Added `User.deletedAt` and 7 snake_case-mapped models: `Household` (`households`), `Person` (`people`), `CrmAccount` (`crm_accounts`), `Appointment` (`appointments`), `LifeEvent` (`life_events`), `ConsentRecord` (`consent_records`), and `ProvenanceRecord` (`provenance_records`, intentionally without FK to `users` to preserve WORM immutability during user/test cleanup).
- **[`fiduciary-os/backend/prisma/sql/privacy_and_audit.sql`](file:///home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/fiduciary-os/backend/prisma/sql/privacy_and_audit.sql)**:
  - Idempotent PL/pgSQL definitions for `encrypt_ssn` / `decrypt_ssn` (`pgcrypto` AES-256 `pgp_sym_encrypt` with non-empty key guard `22023`), `prevent_provenance_mutation` (`42501` triggers on `BEFORE UPDATE OR DELETE` and `BEFORE TRUNCATE`), `append_provenance_record` (`pg_advisory_xact_lock` + SHA-256 `GENESIS -> row_hash` chain), `export_user_data` (redacting password, SSN ciphertext, and Plaid tokens), and `soft_delete_user` (scrubbing PII/SSN/Plaid tokens, revoking sessions, preserving immutable `provenance_records`).
  - Applied additively to BOTH `fiduciary_os` (23 tables, 5 existing dev users preserved untouched) and `fiduciary_os_test`.

### 2. Native Backend Services & REST APIs
- **[`fiduciary-os/backend/src/services/shapleyService.ts`](file:///home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/fiduciary-os/backend/src/services/shapleyService.ts)**: Exact 16-coalition ($2^4$) cooperative-game Shapley attribution with Largest Remainder (Hamilton) rounding strictly summing to `10,000` bps (`additivityError === 0`).
- **[`fiduciary-os/backend/src/services/crmService.ts`](file:///home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/fiduciary-os/backend/src/services/crmService.ts)** & **[`src/routes/crm.ts`](file:///home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/fiduciary-os/backend/src/routes/crm.ts)**: RBAC-scoped CRUD & lifecycle endpoints for `/api/v1/crm/{households,people,accounts,appointments,life-events}` with Zod validation, `pgcrypto` SSN/Plaid encryption, ciphertext stripping, and provenance verification.
- **[`fiduciary-os/backend/src/services/consentService.ts`](file:///home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/fiduciary-os/backend/src/services/consentService.ts)** & **[`src/routes/consent.ts`](file:///home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/fiduciary-os/backend/src/routes/consent.ts)**: Double-opt-in CAN-SPAM/TCPA/GDPR/CCPA ledger (`GET/POST /api/v1/consent`, `GET /api/v1/consent/verify/:channel`) and `verifyOutboundConsent(userId, channel)` guard blocking outbound dispatch unless `opted_in` + `doubleOptInVerified === true`.
- **[`fiduciary-os/backend/src/routes/privacy.ts`](file:///home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/fiduciary-os/backend/src/routes/privacy.ts)**: `POST /api/v1/privacy/export`, `POST /api/v1/privacy/soft-delete`, `GET /api/v1/privacy/provenance/verify`, mounted alongside CRM and Consent in **[`fiduciary-os/backend/src/index.ts`](file:///home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/fiduciary-os/backend/src/index.ts)**.

### 3. Complete `MASTERNEX.os` Decommissioning & Durable `trust-core` Ledger
- Deleted `fiduciary-os/backend/src/services/masternexService.ts`, `trust-core/src/trust/masternex-bridge.ts`, and `trust-core/tests/masternex-bridge.test.mjs`.
- Updated `fiduciary-os/backend/src/routes/{trust,intelligence}.ts`, `src/services/{kdenseService,aiGateway}.ts`, and all three `fiduciary-os/docker-compose*.yml` files to eliminate `masternex` runtime imports/containers/env vars and switch `trust-core` to `LEDGER_MODE: file` (`LEDGER_DIR: /app/.data/ledger`) with persistent named volumes.
- Fixed FD leak in `trust-core/src/store/ledger-store.ts` (`statSync(path).size`), added `trust-core/src/trust/compliance-audit.ts` (`ComplianceAuditEngine` delegating to `ledger.verify()`), added `trust-core/src/engines/shapley.ts`, and replaced tests with `trust-core/tests/unit/{ledger-durable,compliance-audit,shapley}.test.ts`.
- Added backend tests `fiduciary-os/backend/tests/unit/shapley.test.ts` and `fiduciary-os/backend/tests/integration/crm-consent-privacy.test.ts`, and updated `tests/setup.ts` and `tests/unit/ecosystem.test.ts`.

## Independently Verified Metrics
- **`fiduciary-os/backend`**: `npm run type-check` (0 errors); `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/fiduciary_os_test npm test` — **14/14 suites, 110/110 tests passed**.
- **`trust-core`**: `npm run type-check` (0 errors); `npm test` — **7/7 tests passed**.
- **Docker Compose**: `docker compose -f {docker-compose.yml,docker-compose.dev.yml,docker-compose.ecosystem.yml} config` — all 3 validated with 0 `masternex` services/env vars and durable `file` ledger volumes.
- **Masternex Runtime Grep**: **0** runtime imports, services, routes, or env vars in `fiduciary-os/backend/src/`, `trust-core/src/`, and `fiduciary-os/docker-compose*.yml`.
- **PostgreSQL (`fiduciary_os` & `fiduciary_os_test`)**: Both databases have 23 tables (all 7 new CRM/Consent/Provenance tables), `pgcrypto`/`uuid-ossp`/`vector`, all 6 PL/pgSQL functions, and both WORM `42501` triggers. Dev DB `fiduciary_os` preserved all 5 existing users untouched.
- **Adversarial Probes (6/6 PASS)**: WORM `42501` rejection on `UPDATE`/`DELETE`/`TRUNCATE`; 20 concurrent advisory-locked `append_provenance_record` workers with 0 broken links / 0 hash mismatches across 69 rows; `pgcrypto` key validation & round-trip; consent guard state machine; 12 pathological Shapley cases all summing strictly to `10,000` bps; `FileLedgerStore` reopen + 1-byte tamper fail-fast.

## Advisory Notes for Downstream Milestones (M2 / M4)
1. **Frontend Compatibility (`M2`)**: `fiduciary-os/frontend/src/AdvisorCommandCenter.tsx` L655 previously read `trustStatus?.services.masternex.reachable` without optional chaining after `masternex`. Since M1 removed `services.masternex` from `GET /api/v1/trust/status` and M2 owns `AdvisorCommandCenter.tsx` (wiring it to live Postgres CRM), M2 should update that tile to display native PostgreSQL Provenance / Shapley status.
2. **Setup Script (`env-setup.sh`)**: `scripts/env-setup.sh` (outside M1 ownership) can optionally be extended in M2/M6 to apply `fiduciary-os/backend/prisma/sql/privacy_and_audit.sql` after `prisma db push` on fresh environments.
3. **Minor Hardening Candidates (`M2`/`M4`)**: Scope `export_user_data` to `owner_user_id`/`p.user_id` if advisors self-export; align `aiGateway.ts` `trustReceipt.piiRedacted` with Gate 1 in-place redaction; add numeric string validation on `CrmAccount.balance` and optional cross-household FK checks on `personId`/`householdId`.

## Verification Artifacts
- Gate Status: `.agents/teamwork/sub_orch_m1/GATE_STATUS.md`
- Forensic Audit (`CLEAN`): `.agents/teamwork/sub_orch_m1/auditor_m1_handoff.md`
- Primary Review (`APPROVE`): `.agents/teamwork/sub_orch_m1/reviewer_m1_primary_handoff.md`
- Secondary Review (`APPROVE`): `.agents/teamwork/sub_orch_m1/reviewer_m1_secondary_handoff.md`
- Adversarial Challenge (`CONFIRMED`): `.agents/teamwork/sub_orch_m1/challenger_m1_handoff.md`
