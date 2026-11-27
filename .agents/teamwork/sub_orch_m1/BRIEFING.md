# Milestone M1 Briefing — PostgreSQL + `pgcrypto` Household Graph CRM, WORM/Consent Schema & Masternex Removal

- **Sub-Orchestrator**: `sub_orch_m1`
- **Parent Conversation ID**: `67b40cdf4d4adda8649ca02e12ff35f8`
- **Project Root**: `/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint`
- **Prior Baseline**: M0 PASSED (`.agents/teamwork/sub_orch_m0/handoff.md`) — `pgcrypto 1.3` active in `fiduciary_os` and `fiduciary_os_test`; backend tests run against `fiduciary_os_test` via `jest.config.js` (`maxWorkers: 1`, `.env.test`).
- **Database Safety Rule**: NEVER run destructive tests against dev `fiduciary_os`. Apply additive schema & PL/pgSQL functions cleanly to both `fiduciary_os` and `fiduciary_os_test`; run Jest strictly against `fiduciary_os_test`.

## Core Objectives
1. PostgreSQL + `pgcrypto` Household Graph CRM, Consent & Immutable Merkle Ledger (`Household`, `Person`, `CrmAccount`, `Appointment`, `LifeEvent`, `ConsentRecord`, `ProvenanceRecord`) + PL/pgSQL routines (`export_user_data`, `soft_delete_user`, `encrypt_ssn`, `decrypt_ssn`, immutability trigger + `pg_advisory_xact_lock`).
2. Backend REST API routes & services: `/api/v1/crm/*`, `/api/v1/consent`, `/api/v1/privacy/*`, native deterministic 4-factor exact Shapley (`shapleyService.ts`), registered in `src/index.ts`.
3. Complete `MASTERNEX.os` decommissioning across backend, `trust-core`, and `docker-compose*.yml`; switch `trust-core` `LEDGER_MODE` off `memory` to durable mode; comprehensive unit & integration tests.
