# Milestone M0 Handoff — Environment Setup & Verification Baseline (`/env-setup`)

**Sub-Orchestrator**: `sub_orch_m0`
**Gate Verdict**: **PASS** (Iteration 1 — Strict AND: Auditor `CLEAN` + Primary Reviewer `APPROVE` + Secondary Reviewer `APPROVE` + Challenger `CONFIRMED`)

## Deliverables Implemented
1. **[`scripts/env-setup.sh`](file:///home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/scripts/env-setup.sh)** (`-rwxr-xr-x`, `set -euo pipefail`, 201 lines):
   - Repeatable, idempotent `/env-setup` script supporting `--force-install`, `--verify`, and `--help`.
   - Verifies Node (`>=22`), npm (`>=10`), Python (`python3`), Docker, Docker Compose, Docker daemon health, and `fiduciary-os-postgres-1` readiness (`pg_isready`).
   - Idempotently creates isolated test database `fiduciary_os_test` via `docker exec fiduciary-os-postgres-1 psql -U postgres` without touching or wiping the live dev DB `fiduciary_os`.
   - Idempotently enables `"vector"`, `"uuid-ossp"`, and `"pgcrypto"` in BOTH `fiduciary_os` and `fiduciary_os_test`.
   - Provisions gitignored `fiduciary-os/backend/.env.test` (preserving existing file if present).
   - Verifies dependencies across `fiduciary-os/backend`, `fiduciary-os/frontend`, and `trust-core` (skips `npm ci` when up to date; never mutates `package-lock.json`).
   - Runs `npm run db:generate` in `fiduciary-os/backend` and syncs the Prisma schema to `fiduciary_os_test` via `npx prisma db push --skip-generate` (matching `Dockerfile.dev:14` since `migration_lock.toml` is legacy `sqlite`) with both `DATABASE_URL` and `DIRECT_URL` bound strictly to `fiduciary_os_test`.
2. **[`fiduciary-os/backend/docker/init-pgvector.sql`](file:///home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/fiduciary-os/backend/docker/init-pgvector.sql)**:
   - Added `CREATE EXTENSION IF NOT EXISTS "pgcrypto";` alongside `"vector"` and `"uuid-ossp"`.
3. **[`trust-core/package.json`](file:///home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/trust-core/package.json)**:
   - Removed unsupported `--test-isolation=none` flag on Node `v22.23.5` from `test`, `test:unit`, `test:integration`, and `test:live`.
   - Updated `test` to `node --test --test-reporter=spec "tests/**/*.test.mjs" "tests/**/*.test.ts"`.
4. **[`fiduciary-os/backend/.env.test`](file:///home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/fiduciary-os/backend/.env.test)** (gitignored via `fiduciary-os/.gitignore:18`) & **[`fiduciary-os/backend/jest.config.js`](file:///home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/fiduciary-os/backend/jest.config.js)**:
   - Local non-secret test defaults targeting `fiduciary_os_test`.
   - `jest.config.js` loads `.env.test` with `override: false` (preserving explicit shell overrides) and sets `maxWorkers: 1` (preventing parallel `beforeEach` DB truncation races across the 12 Jest suites; zero test files or assertions modified).

## Independently Verified Metrics
- **`./scripts/env-setup.sh`**: Exit `0` across repeated runs and from an isolated temp CWD; zero `package-lock.json` mutations.
- **PostgreSQL (`fiduciary-os-postgres-1`)**:
  - `fiduciary_os`: `pgcrypto 1.3`, `plpgsql 1.0`, `uuid-ossp 1.1`, `vector 0.8.7`; all 16 tables and exact row counts verified 100% untouched before/after setup and Jest runs.
  - `fiduciary_os_test`: `pgcrypto 1.3`, `plpgsql 1.0`, `uuid-ossp 1.1`, `vector 0.8.7`; all 16 Prisma tables synced.
- **`fiduciary-os/frontend`**: `npm run type-check` (0 errors), `npm run lint:styles` (2 suites, 11/11 pass), `npm run test` (**13/13 files, 110/110 tests pass**).
- **`fiduciary-os/backend`**: `npm run type-check` (0 errors), `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/fiduciary_os_test npm test` (**12/12 suites, 101/101 tests pass**).
- **`trust-core`**: `npm run type-check` (0 errors), `npm test` (**1/1 test pass**).

## Verification Artifacts
- Gate Status: `.agents/teamwork/sub_orch_m0/GATE_STATUS.md`
- Forensic Audit (`CLEAN`): `.agents/teamwork/sub_orch_m0/auditor_m0_handoff.md`
- Primary Review (`APPROVE`): `.agents/teamwork/sub_orch_m0/reviewer_m0_primary_handoff.md`
- Secondary Review (`APPROVE`): `.agents/teamwork/sub_orch_m0/reviewer_m0_secondary_handoff.md`
- Adversarial Challenge (`CONFIRMED`): `.agents/teamwork/sub_orch_m0/challenger_m0_handoff.md`
