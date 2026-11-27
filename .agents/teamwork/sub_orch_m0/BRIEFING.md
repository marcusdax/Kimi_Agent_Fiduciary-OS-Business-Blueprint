# Milestone M0 Briefing — Environment Setup & Verification Baseline (`/env-setup`)

## Identity & State Folder
- **Sub-Orchestrator**: `sub_orch_m0`
- **State Folder**: `/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/.agents/teamwork/sub_orch_m0`
- **Original Request**: `/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/.agents/teamwork/ORIGINAL_REQUEST.md`
- **Project Scope**: `/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/PROJECT.md`
- **Survey Baseline**: `/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/.agents/teamwork/explorer_survey_1/handoff.md`

## Acceptance Criteria
1. Create a repeatable, idempotent `/env-setup` script at `scripts/env-setup.sh` (executable) that:
   - Verifies Node, npm, Python, Docker, and running containers.
   - Ensures `pgcrypto`, `vector`, and `uuid-ossp` extensions are enabled in both `fiduciary_os` and a dedicated isolated test database `fiduciary_os_test` (using `docker exec fiduciary-os-postgres-1 psql ...` since host `psql` is not installed).
   - Updates `fiduciary-os/backend/docker/init-pgvector.sql` to also run `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`.
   - Runs `npm run db:generate` in `fiduciary-os/backend` and applies Prisma migrations to `fiduciary_os_test` (never wiping the dev `fiduciary_os` database!).
   - Installs/verifies dependencies across `fiduciary-os/frontend`, `fiduciary-os/backend`, and `trust-core`.
2. Fix `trust-core/package.json` `test` script (remove unsupported `--test-isolation=none` flag on Node v22.23.5 and point to the actual test files so `npm test` passes cleanly).
3. Verify ALL 3 packages pass cleanly on the host:
   - `fiduciary-os/frontend`: `npm run type-check`, `npm run lint:styles`, `npm run test` (110/110+ passing)
   - `fiduciary-os/backend`: `npm run type-check` (0 errors after Prisma generate) and `DATABASE_URL=...fiduciary_os_test npm test` (record exact pass/fail counts; fix any purely env-related test config issue, never weakening assertions)
   - `trust-core`: `npm run type-check` and `npm test` (passes cleanly)

## Exclusive File Ownership
- `scripts/env-setup.sh`
- `fiduciary-os/backend/docker/init-pgvector.sql`
- `trust-core/package.json`
- `fiduciary-os/backend/.env.test` (if needed, gitignored or non-secret local dev test URL)
