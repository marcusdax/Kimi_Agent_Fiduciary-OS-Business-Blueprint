# Explorer Handoff: M0 Packages, Test Scripts & `scripts/env-setup.sh` Plan (`explorer_m0_packages`)

## 1. Executive Summary
All three Node/TypeScript packages (`trust-core`, `fiduciary-os/frontend`, `fiduciary-os/backend`) have committed `package-lock.json` files and pre-installed `node_modules/` on the host. Only one manifest edit is required for M0: fixing `trust-core/package.json:13-16` to remove the unsupported `--test-isolation=none` flag on Node `v22.23.5` and point `test` at actual test globs (`"tests/**/*.test.mjs" "tests/**/*.test.ts"`). Root `scripts/` and root `.gitignore` do not currently exist; `scripts/env-setup.sh` should be created at repo root as a fast, idempotent, non-destructive setup and verification entrypoint covering runtime checks, Docker container checks, dependency verification, Prisma client generation, isolated test DB provisioning, and baseline verification.

---

## 2. Concrete Findings (Evidence-Backed)

### 2.1 `trust-core/` Manifest, TypeScript Config & Tests

- **Package**: `@fiduciary-os/trust-core@1.2.0` (`"type": "module"`, `"engines": { "node": ">=22.6.0" }`)
- **Exact current `scripts` in `trust-core/package.json:10-26`**:
  ```json
  "scripts": {
    "start": "node src/server.ts",
    "mcp": "node src/mcp/main.ts",
    "test": "node --test --test-isolation=none --test-reporter=spec \"tests/unit/**/*.test.ts\" \"tests/integration/**/*.test.ts\"",
    "test:unit": "node --test --test-isolation=none --test-reporter=spec \"tests/unit/**/*.test.ts\"",
    "test:integration": "node --test --test-isolation=none --test-reporter=spec \"tests/integration/**/*.test.ts\"",
    "test:live": "node --test --test-isolation=none --test-reporter=spec \"tests/live/**/*.test.ts\"",
    "type-check": "tsc --noEmit",
    "verify": "npm run type-check && npm run audit && npm test",
    "probe": "node tools/probe-real-data.mjs",
    "probe:json": "node tools/probe-real-data.mjs --json",
    "scan": "node tools/github-scan.mjs",
    "scan:verify": "node tools/verify-curated.mjs",
    "ledger:verify": "node tools/verify-ledger.mjs",
    "mortality:check": "node tools/refresh-mortality.mjs --input ssa.html --year 2023 --check",
    "audit": "node tools/audit.mjs"
  }
  ```
- **Every `*.test.*` / `*.spec.*` file in `trust-core/`** (`find trust-core -not -path '*/node_modules*' \( -name '*.test.*' -o -name '*.spec.*' \)`):
  - `trust-core/tests/masternex-bridge.test.mjs` (42 lines; imports `node:test`, `node:assert/strict`, `../src/trust/ledger.ts`, `../src/trust/masternex-bridge.ts`).
  - `trust-core/tests/unit/`, `trust-core/tests/integration/`, and `trust-core/tests/live/` do **not** exist.
- **`trust-core/tsconfig.json:1-21`**:
  - Uses `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"allowImportingTsExtensions": true`, `"erasableSyntaxOnly": true`, `"noEmit": true`.
  - `"include": ["src/**/*.ts", "tests/**/*.ts", "tools/**/*.mjs"]`.
  - Observed `npm run type-check` (`tsc --noEmit`): **PASS (`exit=0`)**.
- **Empirical `node --test` behavior on host Node `v22.23.5`**:
  1. Current `npm test`: **FAIL (`exit=9`)** — `node: bad option: --test-isolation=none`.
  2. `node --test --test-reporter=spec tests`: **FAIL (`exit=1`)** — `MODULE_NOT_FOUND: Cannot find module '.../trust-core/tests'` (Node 22 treats a bare directory argument as a module path).
  3. `node --test --test-reporter=spec "tests/**/*.test.mjs" "tests/**/*.test.ts"`: **PASS (`exit=0`, 1/1 pass, 208.87ms)**:
     ```text
     ✔ MasternexFiduciaryBridge - Verification and Compliance Audit Generation (3.463988ms)
     ℹ tests 1 / pass 1 / fail 0
     ```
  4. `node --test --test-reporter=spec "tests/**/*.test.{mjs,ts}"`: **PASS (`exit=0`, 1/1 pass, 247.31ms)**.
- **Caveat noted**: `trust-core/tools/` does **not** exist (`ls: cannot access 'trust-core/tools': No such file or directory`), so `npm run audit` / `npm run verify` will fail if invoked. Leave `tools/*` scripts untouched in M0 unless explicitly requested; M0 only needs `npm run type-check` and `npm test` green.

---

### 2.2 Exact Scripts Matrix Across All 3 Packages

| Package | Path | `type-check` | `lint:styles` | `test` | Other Notable Scripts |
|---|---|---|---|---|---|
| `trust-core` | `trust-core/package.json` | `tsc --noEmit` (`:17`) — **PASS** | *(none)* | Current (`:13`): broken (`--test-isolation=none` + missing `unit/`/`integration/`). Target: `node --test --test-reporter=spec "tests/**/*.test.mjs" "tests/**/*.test.ts"` | `start`, `mcp`, `test:unit`, `test:integration`, `test:live` |
| `fiduciary-os/frontend` | `fiduciary-os/frontend/package.json` | `tsc --noEmit` (`:10`) — **PASS** | `node --test scripts/check-chrome-styles.mjs scripts/check-funnel-styles.mjs` (`:14`) — **PASS (11/11)** | `vitest run` (`:11`) — **PASS (13 files, 110/110)** | `build` (`tsc --noEmit && vite build`), `export-preview` |
| `fiduciary-os/backend` | `fiduciary-os/backend/package.json` | `tsc --noEmit` (`:19`) — **FAIL (stale Prisma client, needs `npm run db:generate`)** | *(none)* | `jest` (`:12`) — **needs isolated `DATABASE_URL` pointing to `fiduciary_os_test`** | `db:generate` (`prisma generate`), `db:migrate`, `build` (`tsc`), `lint:security`, `lint:planning`, `lint:financial`, `lint:tools` |

- **CI conventions observed** (`.github/workflows/frontend-ci.yml` & `.github/workflows/backend-ci.yml`):
  - Node `'22'`, `npm ci` using each package's `package-lock.json`.
  - Backend CI runs `npx prisma generate`, `npm run type-check`, `CREATE EXTENSION IF NOT EXISTS "vector";`, `npx prisma db push --skip-generate`, `npx jest --runInBand --coverage`.
  - Backend CI uses `BCRYPT_ROUNDS='4'` and `JWT_SECRET='ci-test-secret'` for fast tests.

---

### 2.3 Repo Layout, `scripts/`, `.gitignore`, Lockfiles & Installed State

- **Root `scripts/`**: Does **not** exist yet (`ls: cannot access 'scripts': No such file or directory`). Must be created for `scripts/env-setup.sh`.
- **`fiduciary-os/scripts/`**: Exists with 3 ESM utility scripts:
  - `fiduciary-os/scripts/backup-restore-drill.mjs` (2,966 B)
  - `fiduciary-os/scripts/smoke-blueprint-tools.mjs` (4,833 B)
  - `fiduciary-os/scripts/smoke-financial-api.mjs` (2,381 B)
- **`.gitignore` files**:
  - Root `.gitignore` does **not** exist.
  - `fiduciary-os/.gitignore` (75 lines) already ignores `node_modules/`, `dist/`, `.env`, `.env.local`, `.env.test`, `coverage/`, `*.log`.
  - `trust-core/.gitignore` (5 lines) ignores `node_modules/`, `.npmcache/`, `*.log`, `.env.data/`.
  - Note: Any `.env.test` file placed inside `fiduciary-os/backend/` is already covered by `fiduciary-os/.gitignore:18` (`.env.test`).
- **Lockfiles & `node_modules` presence on host**:
  - `fiduciary-os/backend/package-lock.json` (357,510 B) + `node_modules/` (516 entries; `.bin/{jest,prisma,tsc}` present)
  - `fiduciary-os/frontend/package-lock.json` (75,608 B) + `node_modules/` (89 entries; `.bin/{tsc,vitest}` present)
  - `trust-core/package-lock.json` (1,521 B) + `node_modules/` (6 entries; `.bin/tsc` present)
- **Host Runtime & Docker Status (observed)**:
  - Node `v22.23.5`, npm `12.2.2`, Python `3.12.16`, Docker `29.10.0`, Docker Compose `v5.8.0`.
  - Running containers (`docker ps`):
    - `fiduciary-os-postgres-1` (Up, healthy, `:5432`)
    - `fiduciary-os-redis-1` (Up, healthy, `:6379`)
    - `fiduciary-os-trust-core-1` (Up, healthy, `:3002`)
    - `fiduciary-os-masternex-1` (Up, healthy, `:8080`)
    - `fiduciary-os-backend-1` (Up, healthy, `:3001`)
    - `fiduciary-os-frontend-1` (Up, `:5173`)
    - `fiduciary-os-tunnel` (Up)

---

## 3. Concrete Implementation Plan

### Step 1: Fix `trust-core/package.json` (`:13-16`)
Remove `--test-isolation=none` from all 4 test scripts and point `test` to `"tests/**/*.test.mjs" "tests/**/*.test.ts"` so it passes today on `masternex-bridge.test.mjs` and automatically picks up future `.test.ts`/`.test.mjs` files in `tests/` and subdirectories:

```json
"test": "node --test --test-reporter=spec \"tests/**/*.test.mjs\" \"tests/**/*.test.ts\"",
"test:unit": "node --test --test-reporter=spec \"tests/unit/**/*.test.ts\"",
"test:integration": "node --test --test-reporter=spec \"tests/integration/**/*.test.ts\"",
"test:live": "node --test --test-reporter=spec \"tests/live/**/*.test.ts\"",
```

**Verification**:
```bash
cd trust-core && npm run type-check && npm test
```
Expected: `tsc --noEmit` exits `0`; `npm test` runs `MasternexFiduciaryBridge - Verification and Compliance Audit Generation` -> `1/1 pass`, exits `0`.

### Step 2: Create Executable `scripts/env-setup.sh`
Create `/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/scripts/env-setup.sh` (`chmod +x`), using `set -euo pipefail` and resolving `REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"`. Support optional flags: `--force-install` (force `npm ci`) and `--verify` (also run baseline type-check/lint/test suite at the end).

**Sections of `scripts/env-setup.sh`**:
1. **Runtime Preconditions Check**:
   - Verify `node` exists and major version `>= 22` (matches `engines.node` in all 3 packages: `>=22.6.0` / `^22.22.2`).
   - Verify `npm` (`>= 10`), `python3` (`>= 3.10`), `docker`, and `docker compose` exist; print observed versions.
2. **Docker Stack Check**:
   - Check `docker info >/dev/null 2>&1`.
   - Verify required containers (`fiduciary-os-postgres-1`, `fiduciary-os-redis-1`, `fiduciary-os-backend-1`, `fiduciary-os-frontend-1`, `fiduciary-os-trust-core-1`) are running via `docker ps --format '{{.Names}}'`.
   - Warn (or start postgres if stopped? For M0, fail loudly with actionable `docker compose -f fiduciary-os/docker-compose.dev.yml up -d` hint if `fiduciary-os-postgres-1` is not running, since DB setup depends on it).
3. **Fast, Idempotent Dependency Installation Helper (`ensure_npm_deps <dir> <expected_bin>`)**:
   - Do **not** run `npm install` (which mutates `package-lock.json` and is slow).
   - Check if `--force-install` was passed OR `<dir>/node_modules` is missing OR `<dir>/node_modules/.bin/<expected_bin>` is missing OR `<dir>/package-lock.json` is newer than `<dir>/node_modules/.package-lock.json`:
     - If any condition is true, run `(cd "$dir" && npm ci --no-audit --no-fund)`.
     - Otherwise, log `✓ <dir>: dependencies already installed and up to date (skipping npm ci)`.
   - Invoke for all 3 packages:
     - `ensure_npm_deps "$REPO_ROOT/fiduciary-os/backend" "prisma"`
     - `ensure_npm_deps "$REPO_ROOT/fiduciary-os/frontend" "vitest"`
     - `ensure_npm_deps "$REPO_ROOT/trust-core" "tsc"`
4. **Prisma Client Generation & Isolated Test Database Setup** (coordinating with `explorer_m0_db`'s exact DB credentials/container commands):
   - Run `(cd "$REPO_ROOT/fiduciary-os/backend" && npm run db:generate)` (fast, idempotent, fixes the `TS2339: Property 'workspaceState'` error on host).
   - Via `docker exec fiduciary-os-postgres-1 psql ...`:
     - Enable `CREATE EXTENSION IF NOT EXISTS "vector";`, `"uuid-ossp"`, and `"pgcrypto"` on dev DB `fiduciary_os`.
     - Idempotently create `fiduciary_os_test` database if not exists, enable `"vector"`, `"uuid-ossp"`, `"pgcrypto"` on `fiduciary_os_test`.
     - Push Prisma schema / apply migrations to `fiduciary_os_test` (`DATABASE_URL` pointed strictly at `fiduciary_os_test`, never `fiduciary_os`).
5. **Optional `--verify` Baseline Gate**:
   - `trust-core`: `npm run type-check && npm test`
   - `fiduciary-os/frontend`: `npm run type-check && npm run lint:styles && npm test`
   - `fiduciary-os/backend`: `npm run type-check` and `DATABASE_URL=...fiduciary_os_test DIRECT_URL=...fiduciary_os_test JWT_SECRET=test-secret BCRYPT_ROUNDS=4 npx jest --runInBand`

### Step 3: Non-Destructive Idempotency Guarantee
- Running `scripts/env-setup.sh` twice in a row must:
  - Produce `0` `git diff` changes to any `package-lock.json`.
  - Skip `npm ci` on the second run (completing the dependency step in <1s).
  - Never truncate or modify the live `fiduciary_os` dev database.
