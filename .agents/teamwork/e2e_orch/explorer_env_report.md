# E2E Track — Environment & Tooling Discovery Report

**Generated:** 2026-11-27  
**Repo Root:** `/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint`  
**Mode:** Read-only opaque-box inspection

---

## 1. Host Runtime & Installed Test Tooling

| Tool / Runtime | Observed Version / Status | Location |
|---|---|---|
| **Node.js** | `v22.23.5` (native `node:test`, `node:assert/strict`, `fetch`, and default TS type-stripping) | PATH |
| **npm** | `12.2.2` | PATH |
| **Root `package.json`** | None (neither repo root nor `fiduciary-os/` has a `package.json`) | — |
| **Frontend test stack** | `vitest ^5.1.0`, `jsdom ^31.0.0`, `axe-core ^4.14.0`, `@testing-library/react ^16.3.3`, `node --test` (used by `lint:styles`) | `fiduciary-os/frontend/package.json` (`"type": "module"`) |
| **Backend test stack** | `jest ^29.7.0`, `ts-jest ^29.1.2`, `supertest ^7.3.1`, `tsx ^4.23.15` | `fiduciary-os/backend/package.json` (`"type": "commonjs"`) |
| **Trust-Core test stack** | `node --test --test-isolation=none --test-reporter=spec` running `.ts` directly (zero test deps) | `trust-core/package.json` (`"type": "module"`) |
| **Playwright (Node)** | **Not installed** in any `package.json` or `node_modules` | — (only Python `/opt/pyenv/shims/playwright` & `/usr/bin/google-chrome` exist on host) |

### Recommended Zero-Friction Runner for `fiduciary-os/e2e/`
- **Use Node.js built-in `node:test` + `node:assert/strict` + native `fetch`** with `"type": "module"` in `fiduciary-os/e2e/package.json` (using `.mjs` or erasable-syntax `.ts` files).
- **Why:**
  1. **Zero dependencies / zero `npm install`** — avoids any CJS/ESM or TypeScript version conflict between `backend` (TS 5.3 / Jest / CJS) and `frontend` (TS 7.0 / Vitest / ESM).
  2. **Consistent with repo conventions** — matches `trust-core` (`node --test`) and `fiduciary-os/frontend` (`lint:styles` uses `node --test`).
  3. **Fast & self-contained** — supports live HTTP assertions (`fetch`), file/repo checks (`node:fs`), and CLI checks (`node:child_process`, e.g., invoking `npm run lint:copy` in `fiduciary-os/frontend`).

---

## 2. `fiduciary-os/e2e/` Directory Status

- **`fiduciary-os/e2e/` does NOT currently exist.**
- Current top-level contents of `fiduciary-os/`:
  - Directories: `backend/`, `docs/`, `frontend/`, `scripts/`
  - Files: `.env.dev`, `.gitignore`, `CONTRIBUTING.md`, `LICENSE`, `Makefile`, `README.md`, `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.ecosystem.yml`

---

## 3. Service Topology & Default URLs (`fiduciary-os/docker-compose.dev.yml`)

| Service | Host Port | Default E2E Env Var | Health Endpoint | Notes |
|---|---|---|---|---|
| **Backend (Express API)** | `3001` | `E2E_BACKEND_URL=http://localhost:3001` | `GET /health` | API prefix `/api/v1` (per `.env.dev`); CORS origin `http://localhost:5173`; rate limit `1000 / 15m` |
| **Trust-Core (Engine + MCP)** | `3002` | `E2E_TRUST_CORE_URL=http://localhost:3002` | `GET /health` | Note: currently sets `LEDGER_MODE: memory` in compose (M1 migrates to durable); response includes `x-ratelimit-limit: 20` |
| **Frontend (Vite React 19)** | `5173` | `E2E_FRONTEND_URL=http://localhost:5173` | `GET /` (200 HTML) | Proxies `/api/v1` → `http://backend:3001` |
| **PostgreSQL 16 (`pgvector`)** | `5432` | — | `pg_isready -U postgres -d fiduciary_os` | `postgres:postgres@localhost:5432/fiduciary_os` |
| **Redis 7** | `6379` | — | `redis-cli ping` | Enabled in compose (`REDIS_ENABLED: "true"`) |
| **Masternex (Legacy)** | `8080` | — | `GET /health` | Profile `masternex` in `docker-compose.dev.yml` and service in `docker-compose.ecosystem.yml` (to be removed in M1) |

- **Repo root env default:** `E2E_REPO_ROOT=/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint` (resolvable via `path.resolve(import.meta.dirname, '..', '..')` from `fiduciary-os/e2e/`).

---

## 4. Live Service Health Probe (Observed at 2026-11-27T00:29Z)

| Port | Service | Status | Observed Response |
|---|---|---|---|
| `3001` | Backend | **UP (HTTP 200)** | `GET /health` → `{"status":"healthy","version":"1.0.0","environment":"development","services":{"database":"connected","redis":"connected"}}` |
| `3002` | Trust-Core | **UP (HTTP 200)** | `GET /health` → `{"status":"ok","uptimeSeconds":22464,"production":false}` (header `x-ratelimit-limit: 20`) |
| `5173` | Frontend | **UP (HTTP 200)** | `GET /` → `200 OK`, `Content-Type: text/html`, Vite React entry HTML |
| `8080` | Masternex | **UP (HTTP 200)** | `GET /health` → `{"status":"ok","version":"0.1.0","uptime_s":66982.062}` *(pre-M1 baseline)* |

> **Important E2E Caveat:** `trust-core` on `:3002` returns `x-ratelimit-limit: 20`. Tests hitting `trust-core` directly should stay concise or respect rate-limit headers to avoid transient `429` responses.

---

## 5. Exact File Paths for F18 (Unit Economics / Blueprint) & F8 (Masternex Removal)

### Root Documentation & Financial Model Files (F18)
All paths relative to `/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint`:
- `Unit_Economics.md` — **Present** (v2.0, already shows Solo `$4,950 / 9.9×`, Growth `$14,950 / 10.0×`, Enterprise `$120,000 / 15.0×`, B2C Premium `$255 / 8.5×`)
- `FINANCIAL_MODEL_PACKAGE.md` — **Present**
- `07_Scenario_Analysis.csv` — **Present** (currently shows Year 5 Base Revenue `21049999` and Base ARR `19948393`; M5 reconciles Base vs Legacy `$28.02M` vs Upside `$51.7M`)
- Supporting CSVs & model scripts: `01_Assumptions.csv` through `06_SaaS_Metrics.csv`, `model/build_model.py`, `model/outputs.json`
- `UNIFIED_PLATFORM_BLUEPRINT.md` — **Does NOT exist yet** (planned deliverable of M5)

### Masternex Removal Targets (F8)
Files currently referencing `masternex` that F8 E2E assertions should verify once M1 completes:
- `fiduciary-os/docker-compose.dev.yml` (lines 11–12, 66, 105, 119)
- `fiduciary-os/docker-compose.ecosystem.yml` (lines 46, 56, 98, 107, 133)
- `fiduciary-os/.env.dev` (lines 47–49: `MASTERNEX_API_URL`, `MASTERNEX_JWT`)
