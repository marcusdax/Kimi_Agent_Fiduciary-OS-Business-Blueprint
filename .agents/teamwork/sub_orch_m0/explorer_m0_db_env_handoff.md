# Explorer Handoff — M0 Database, Docker, Prisma & Jest Environment (`explorer_m0_db_env`)

**Executive Summary:** Inspected the live Docker containers, PostgreSQL 16 database state, Prisma schema/migrations, `.gitignore`, and all 12 backend Jest test suites in `/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint`. Discovered **three critical gotchas** that would otherwise break M0:
1. **`npx prisma migrate deploy` WILL FAIL** because `fiduciary-os/backend/prisma/migrations/migration_lock.toml` is still `provider = "sqlite"` and the 6 historical migration SQL files use SQLite syntax (`DATETIME`, `REAL`) while `schema.prisma` targets `postgresql`. The live dev container (`Dockerfile.dev:14`) uses **`npx prisma db push --skip-generate`** — `scripts/env-setup.sh` must use `npx prisma db push --skip-generate` against `fiduciary_os_test` (not `migrate deploy`), and must set **both** `DATABASE_URL` and `DIRECT_URL` (required by `schema.prisma:7-8`).
2. **Backend Jest requires `JWT_SECRET`, `DATABASE_URL`, `DIRECT_URL`, and `ENABLE_AI_INSIGHTS=true`, and does NOT auto-load `.env.test`**. Creating gitignored `fiduciary-os/backend/.env.test` (already covered by `fiduciary-os/.gitignore:18`) + loading it in Jest `setupFiles` (before `PrismaClient` or service modules import) makes plain `npm test` work out of the box without manual shell exports.
3. **Parallel Jest workers race on shared `fiduciary_os_test`**: `tests/setup.ts:4-21` runs `prisma.$transaction([...deleteMany()])` across 13 tables in `beforeEach` for all 12 suites. Running Jest with `--runInBand` (or `maxWorkers: 1` in `jest.config.js`) prevents cross-suite truncation races.

---

## 1. Exact Observed State

### 1.1 `fiduciary-os/backend/docker/init-pgvector.sql`
Current contents (lines 1–4):
```sql
-- Automatic pgvector initialization for local Docker PostgreSQL
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```
- Mounted read-only into `fiduciary-os-postgres-1` at `/docker-entrypoint-initdb.d/01-init-pgvector.sql:ro` (`fiduciary-os/docker-compose.dev.yml:29`).
- Note: Docker entrypoint init scripts only execute on fresh volume initialization, so existing volumes (`dev_pg_data`) also need `CREATE EXTENSION IF NOT EXISTS "pgcrypto";` executed live via `docker exec` in `scripts/env-setup.sh`.

### 1.2 Live Docker & PostgreSQL / Redis Inspection
Observed via `docker inspect` and `docker exec fiduciary-os-postgres-1 psql -U postgres`:
- **Postgres container:** `fiduciary-os-postgres-1` (`pgvector/pgvector:pg16`, PG `16.16-1.pgdg12+1`)
  - Credentials (`docker inspect`): `POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=postgres`, `POSTGRES_DB=fiduciary_os`
  - Host port binding: `5432/tcp -> 0.0.0.0:5432` and `[::]:5432`
  - Connection string from host:
    - Dev DB (DO NOT run Jest against this): `postgresql://postgres:postgres@127.0.0.1:5432/fiduciary_os`
    - Isolated Test DB (to create): `postgresql://postgres:postgres@127.0.0.1:5432/fiduciary_os_test`
- **Redis container:** `fiduciary-os-redis-1` (`redis:7-alpine`, Redis `7.4.12`), bound to `6379/tcp -> 0.0.0.0:6379`.
- **Current databases (`psql -U postgres -l`):**
  - `fiduciary_os` (owner `postgres`, UTF8)
  - `postgres`, `template0`, `template1`
  - **`fiduciary_os_test` does NOT exist yet.**
- **Current extensions in `fiduciary_os` (`\dx`):**
  - `plpgsql` (`1.0`), `uuid-ossp` (`1.1`), `vector` (`0.8.7`).
  - `pgcrypto` (`1.3`) is **available** (`pg_available_extensions`) but **not yet installed** (`installed_version` is empty).
- **Current tables in `fiduciary_os` (`\dt`):**
  - 16 tables present (`AuthSession`, `SessionRefresh`, `ToolScenario`, `ai_interactions`, `documents`, `embedding`, `financial_plans`, `holdings`, `ledger_entries`, `planning_actions`, `planning_events`, `portfolios`, `profiles`, `sessions`, `users`, `workspace_states`).
  - **`_prisma_migrations` does NOT exist** (`ERROR: relation "_prisma_migrations" does not exist`).

### 1.3 Prisma Schema & Migrations Gotcha
- `fiduciary-os/backend/prisma/schema.prisma:5-9`:
  ```prisma
  datasource db {
    provider  = "postgresql"
    url       = env("DATABASE_URL")
    directUrl = env("DIRECT_URL")
  }
  ```
  Both `DATABASE_URL` and `DIRECT_URL` are mandatory for Prisma CLI commands (`db push`, `migrate`).
- `fiduciary-os/backend/prisma/migrations/migration_lock.toml`:
  ```toml
  provider = "sqlite"
  ```
- All 6 migration directories under `fiduciary-os/backend/prisma/migrations/` (`20260407022907_init` … `20261108100000_sessions_replay`) contain SQLite DDL (`DATETIME`, `REAL`) and predate `Embedding`, `LedgerEntry`, and `WorkspaceState`.
- `fiduciary-os/backend/Dockerfile.dev:14` confirms the working schema-sync command for PostgreSQL:
  ```sh
  npx prisma db push --skip-generate
  ```
- **Consequence:** Do **NOT** run `npx prisma migrate deploy` in M0 (it will fail with `P3019` provider mismatch against `sqlite`). Use `npm run db:generate` followed by `npx prisma db push --skip-generate` with `DATABASE_URL` and `DIRECT_URL` pointing to `fiduciary_os_test`. (Clean PostgreSQL baseline migrations belong to M1 when CRM/Consent/Merkle migrations are introduced.)

### 1.4 Jest, `.gitignore`, and Backend Test Environment Requirements
- **Gitignore check (`git check-ignore -v`):**
  - `fiduciary-os/backend/.env.test` -> **gitignored** by `fiduciary-os/.gitignore:18` (`.env.test`).
  - `fiduciary-os/backend/.env` -> **gitignored** by `fiduciary-os/.gitignore:14` (`.env`).
  - Neither file currently exists on disk (only `fiduciary-os/.env.dev` and `fiduciary-os/backend/.env.example` exist).
- **Test files (12 total):**
  - `fiduciary-os/backend/src/services/__tests__/retirementSimulation.test.ts`
  - `fiduciary-os/backend/tests/unit/{aiGuardrails,auth,dataProvenance,ecosystem,financial-plan,observations,planning,request-privacy,security,sessions,toolkit}.test.ts`
- **Jest configuration (`fiduciary-os/backend/jest.config.js`):**
  - `preset: 'ts-jest'`, `testEnvironment: 'node'`, `setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']`.
  - No `setupFiles` currently loads `.env.test` (and `tests/setup.ts` does not call `dotenv.config()`). Only `src/index.ts:34` calls `dotenv.config()`, which unit tests never import.
- **Env vars required by backend tests (audited via `rg 'process\.env'` across `src/` and `tests/`):**
  1. `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/fiduciary_os_test` — required by `tests/setup.ts` (`prisma.$transaction`) and all DB-backed unit tests (`auth`, `sessions`, `security`, `planning`, `financial-plan`, `toolkit`, `observations`, `dataProvenance`, `ecosystem`).
  2. `DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:5432/fiduciary_os_test` — required by `prisma/schema.prisma:8`.
  3. `JWT_SECRET=test-jwt-secret-fiduciary-os-at-least-32-chars` — **REQUIRED** by `src/middleware/auth.ts:36-39` (`throw new AppError(500, 'JWT secret not configured')`) and `src/services/sessions.ts:15-16` (`throw new AppError(500, 'Authentication unavailable')`). Without it, all auth/session/planning/financial-plan/toolkit/dataProvenance tests fail with 500!
  4. `NODE_ENV=test` — keeps `allowMockFallback()` (`src/utils/dataSource.ts:16`) enabled and disables Redis localhost connections (`src/config/redis.ts:11`).
  5. `REDIS_ENABLED=false` — explicitly prevents any accidental Redis connection attempts (`src/config/redis.ts:7`). Note: `ecosystem.test.ts:9-11` already mocks `../../src/config/redis`.
  6. `ENABLE_AI_INSIGHTS=true` — checked by `src/routes/ai.ts:20` and `src/routes/ai-enhanced.ts:22` (`dataProvenance.test.ts:25` also sets this in `beforeEach`).
  7. `BCRYPT_ROUNDS=4` — optional speedup for `src/routes/auth.ts:40` (defaults to `12`, which makes 100+ auth registrations in tests noticeably slower).
  8. Leave `ANTHROPIC_API_KEY`, `ALPHA_VANTAGE_API_KEY`, `TRUST_CORE_URL`, `MASTERNEX_API_URL`, `KDENSE_URL`, `HF_TOKEN` **unset** in `.env.test` so tests exercise deterministic local/fallback paths cleanly without external network flakiness.
- **Potential Failure Modes Audited:**
  - **Parallel worker DB races:** `tests/setup.ts:6-20` deletes 13 tables in `beforeEach`. Because 9+ test suites insert `User`/`AuthSession`/etc. into the same `fiduciary_os_test` DB, Jest's default parallel execution will cause race failures unless `maxWorkers: 1` is set in `jest.config.js` (or `"test": "jest --runInBand"` in `package.json`).
  - **Vector extension in `fiduciary_os_test`:** `ecosystem.test.ts:84-100` calls `POST /api/v1/intelligence/embed` and `/search` against the `embedding` table (`vector(1536)`). Enabling `vector` in `fiduciary_os_test` **before** `npx prisma db push` is mandatory.
  - **No `psql` on host:** Host VM does not have `psql` or `pg_isready` installed; all DB admin commands in `scripts/env-setup.sh` must run via `docker exec fiduciary-os-postgres-1 psql -U postgres ...`.

---

## 2. Concrete Implementation Plan

### Step 1: Edit `fiduciary-os/backend/docker/init-pgvector.sql`
Add `CREATE EXTENSION IF NOT EXISTS "pgcrypto";` to `fiduciary-os/backend/docker/init-pgvector.sql`:
```sql
-- Automatic pgvector, uuid-ossp, and pgcrypto initialization for local Docker PostgreSQL
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

### Step 2: Create `scripts/env-setup.sh` (executable, `chmod +x`, `set -euo pipefail`)
Idempotent setup script runnable from repo root (`/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint`):
1. **Preflight checks:** Verify `node`, `npm`, `docker`, and that `fiduciary-os-postgres-1` is running and healthy (`docker exec fiduciary-os-postgres-1 pg_isready -U postgres -d fiduciary_os`).
2. **Idempotently create `fiduciary_os_test` (never touching or dropping `fiduciary_os`):**
   ```bash
   if ! docker exec fiduciary-os-postgres-1 psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='fiduciary_os_test'" | grep -q 1; then
     docker exec fiduciary-os-postgres-1 psql -U postgres -c "CREATE DATABASE fiduciary_os_test;"
   fi
   ```
3. **Idempotently enable `vector`, `uuid-ossp`, and `pgcrypto` in BOTH `fiduciary_os` and `fiduciary_os_test`:**
   ```bash
   for db in fiduciary_os fiduciary_os_test; do
     docker exec fiduciary-os-postgres-1 psql -U postgres -d "$db" -v ON_ERROR_STOP=1 -c \
       'CREATE EXTENSION IF NOT EXISTS "vector"; CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS "pgcrypto";'
   done
   ```
4. **Write gitignored `fiduciary-os/backend/.env.test` (if missing, or refresh test defaults safely):**
   ```dotenv
   NODE_ENV=test
   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/fiduciary_os_test
   DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:5432/fiduciary_os_test
   JWT_SECRET=test-jwt-secret-fiduciary-os-at-least-32-chars
   REDIS_ENABLED=false
   ENABLE_AI_INSIGHTS=true
   BCRYPT_ROUNDS=4
   ```
5. **Regenerate host Prisma client & push schema to `fiduciary_os_test`:**
   ```bash
   (
     cd fiduciary-os/backend
     npm run db:generate
     DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/fiduciary_os_test" \
     DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:5432/fiduciary_os_test" \
       npx prisma db push --skip-generate
   )
   ```
   *(Note: uses `db push --skip-generate` instead of `migrate deploy` because `migration_lock.toml` is `sqlite` — see §1.3.)*
6. **Optional dependency check:** Verify `node_modules` exist in `fiduciary-os/backend`, `fiduciary-os/frontend`, and `trust-core` (only run `npm ci` if missing, keeping re-runs fast).

### Step 3: Wire Jest to Auto-Load `.env.test` & Prevent Parallel DB Races
To ensure `cd fiduciary-os/backend && npm test` passes reliably without manual env exports:
1. Create a tiny `fiduciary-os/backend/tests/load-env.ts` (or load via `jest.config.js` `setupFiles`):
   ```ts
   import path from 'path';
   import dotenv from 'dotenv';

   dotenv.config({ path: path.resolve(__dirname, '../.env.test'), override: false });
   ```
   - `override: false` ensures explicit shell/CI overrides still win, while local `npm test` automatically picks up `.env.test` **before** `tests/setup.ts` or any service module imports `PrismaClient` / reads `process.env`.
2. In `fiduciary-os/backend/jest.config.js`:
   - Add `setupFiles: ['<rootDir>/tests/load-env.ts'],`
   - Add `maxWorkers: 1,` (prevents parallel `beforeEach` `deleteMany()` collisions across the 12 suites sharing `fiduciary_os_test`).

---

## 3. Verification Commands (Post-Implementation)
```bash
# 1. Run idempotent setup twice to confirm idempotency
./scripts/env-setup.sh && ./scripts/env-setup.sh

# 2. Verify extensions in BOTH databases and confirm fiduciary_os untouched
docker exec fiduciary-os-postgres-1 psql -U postgres -d fiduciary_os -c '\dx'
docker exec fiduciary-os-postgres-1 psql -U postgres -d fiduciary_os_test -c '\dx'
docker exec fiduciary-os-postgres-1 psql -U postgres -d fiduciary_os_test -c '\dt'

# 3. Verify backend typecheck & full Jest suite
cd fiduciary-os/backend && npm run type-check && npm test

# 4. Verify .env.test is ignored by git
git status --short
```
