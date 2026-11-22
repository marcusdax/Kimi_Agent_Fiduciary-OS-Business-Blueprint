# Wealth Symphony — Integrated Ecosystem Design
**Date**: 2026-11-21  
**Status**: Active implementation — Phase 1 + 2 in progress

---

## Intent and Why

Wealth Symphony (Fiduciary OS) has two production-quality components: the Express/Prisma backend and the trust-core module (240+ tests, 5 MCP calculators, tamper-evident EvidenceLedger). The gap is that none of the platform's AI outputs carry cryptographic audit trails or regulatory compliance proofs.

This design wires three existing systems together — MASTERNEX.os, K-Dense BYOK (Kady), and trust-core's EvidenceLedger — to close that gap. It also migrates the data layer to Supabase for pgvector-powered semantic search and TimescaleDB time-series queries.

---

## Goals

1. Every AI advisory output gets a tamper-evident, offline-verifiable ledger entry (SHA-256 hash chain + Ed25519 signature).
2. EU AI Act Art. 12 + SR 11-7 compliance certificates are generatable on demand via a single API call.
3. MASTERNEX FiduciaryOSGuard + AI Flight Recorder receive every advisory event for SHAP attribution and compliance recording.
4. The trust-core MCP server exposes a 6th tool (`fidos_compliance_audit`) callable from Claude Code and K-Dense.
5. Supabase/PostgreSQL replaces SQLite as the production database, with pgvector for semantic search.

## Non-Goals

- Real-time carrier quoting (insurance)
- Plaid account aggregation
- PRINCE federated benchmarks (Phase 4)
- Fine-tuned advisor model (Phase 5)

## Anti-Goals

- PII in audit ledger or MASTERNEX payloads (all entries carry only hashes and metadata)
- Blocking AI responses on trust-core/MASTERNEX availability (all calls are fire-and-forget)

---

## Approaches Considered

**Option A — Direct import of trust-core in backend**: Import `EvidenceLedger` from trust-core directly into `aiGateway.ts` as a workspace dependency. Tight coupling; ESM/CJS boundary requires dynamic imports; breaks the trust-core/backend process separation.

**Option B — HTTP sidecar** *(chosen)*: `aiGateway.ts` POSTs to trust-core's HTTP server (`/api/v1/ledger/entries`). Matches existing architecture (trust-core runs as a separate process). Fire-and-forget keeps latency impact at zero. trust-core already has the route.

---

## Architecture

```
Fiduciary OS Backend (Express, CommonJS)
  └── aiGateway.ts
        ├── POST /api/v1/ledger/entries → trust-core:3002   (fire-and-forget)
        └── masternexService.recordEvent() → masternex:8080 (fire-and-forget)

trust-core HTTP (ESM, Node)
  ├── GET /api/v1/ledger/audit → MasternexFiduciaryBridge.generateComplianceAudit(ledger)
  └── MCP stdio → fidos_compliance_audit tool

MASTERNEX.os (FastAPI, Python)
  ├── POST /v1/auctum/fiduciary/evaluate  (no auth)
  ├── POST /v1/recorder/events            (scope: ledger:write)
  └── GET  /v1/compliance/report          (scope: compliance:read)
```

---

## Files Changed

### Phase 1 — Trust + Compliance Integration

| File | Change |
|---|---|
| `trust-core/src/server.ts` | Import `MasternexFiduciaryBridge`, create `masternexBridge` instance, add `GET /api/v1/ledger/audit` route, export `masternexBridge` |
| `trust-core/src/mcp/server.ts` | Add `ledger?` + `masternexBridge?` to `McpDeps`, add `fidos_compliance_audit` to `TOOLS`, add `case 'fidos_compliance_audit'` in `callTool` |
| `trust-core/src/mcp/main.ts` | Import + create `ledger`, `masternexBridge`; pass both to `runStdio` |
| `fiduciary-os/backend/src/services/aiGateway.ts` | Add `createHash` + `masternexService` imports, add `TRUST_CORE_URL` + `TRUST_CORE_SERVICE_TOKEN` constants, add fire-and-forget calls after `recordInteraction` |
| `fiduciary-os/backend/src/services/masternexService.ts` | **New** — HTTP client: `evaluateFiduciary`, `recordEvent`, `getComplianceReport` |
| `fiduciary-os/docker-compose.dev.yml` | **New** — multi-service dev: backend + trust-core + masternex |
| `.claude/settings.json` | **New** — MCP server config for trust-core + masternex |

### Phase 2 — Data Foundation

| File | Change |
|---|---|
| `fiduciary-os/backend/prisma/schema.prisma` | `provider = "postgresql"`, `flags String[] @default([])`, add `Embedding` + `LedgerEntry` models |
| `fiduciary-os/backend/supabase/setup.sql` | **New** — pgvector, RLS policies, ivfflat index |
| `fiduciary-os/backend/.env.example` | Add `MASTERNEX_API_URL`, `MASTERNEX_JWT`, `TRUST_CORE_URL`, `TRUST_CORE_SERVICE_TOKEN`, Supabase vars |

---

## Key Design Decisions

### fire-and-forget for ledger + MASTERNEX calls
AI responses must not block on external service availability. Both trust-core and MASTERNEX calls are non-blocking (`void fetch(...).catch(logger.warn)`). The supervisory record in Prisma is still synchronous (fail-closed in production).

### masternex-bridge.ts is local-only
`MasternexFiduciaryBridge` at `trust-core/src/trust/masternex-bridge.ts` computes Merkle roots and compliance reports from the in-memory `EvidenceLedger` with no network calls. It is used by the new `GET /api/v1/ledger/audit` route in trust-core's HTTP server and by the new `fidos_compliance_audit` MCP tool. The separate `masternexService.ts` handles HTTP calls to the MASTERNEX.os FastAPI service.

### trust-core service token
The `POST /api/v1/ledger/entries` route requires `scope: ledger:write`. The backend passes `TRUST_CORE_SERVICE_TOKEN` as a Bearer token. If the env var is unset (dev without trust-core), the call is still made without auth (trust-core returns 401, which is silently swallowed by the `.catch`).

### PostgreSQL flags array
`AiInteraction.flags` changes from comma-joined `String` to `String[] @default([])`. The `recordInteraction` call in `aiGateway.ts` is updated from `flags: entry.flags.join(',')` to `flags: entry.flags` to match. This is a breaking schema change requiring `prisma migrate dev`.

---

## Verification Steps

### Phase 1
1. `cd trust-core && npm start` (HTTP at :3002)
2. `GET http://localhost:3002/api/v1/ledger/audit` → `{ compliance_status: "CONFORMANT", ... }`
3. Make an AI call via backend → check trust-core logs for ledger append
4. `npx @modelcontextprotocol/inspector http://localhost:3002/mcp` → call `fidos_compliance_audit`
5. `cd trust-core && npm test` — 240+ tests must pass

### Phase 2
1. Set `DATABASE_URL` to Supabase connection string
2. `cd fiduciary-os/backend && npx prisma migrate dev`
3. Run `supabase/setup.sql` against the Supabase project
4. Confirm `Embedding` and `LedgerEntry` tables in Supabase dashboard
5. Test AI call end-to-end against Supabase DB

---

## Open Items

- **Supabase org**: Phase 2 needs a Supabase project created. Run `mcp__Supabase__list_organizations` then `mcp__Supabase__create_project` to provision.
- **TRUST_CORE_SERVICE_TOKEN**: Needs a `ledger:write`-scoped JWT from trust-core's auth system. Generate via `POST /api/v1/auth/token` with service account credentials.
- **K-Dense registration**: Wire trust-core + MASTERNEX as K-Dense MCP servers via `PUT http://127.0.0.1:8000/mcp?scope=global` (Phase 3).
- **Nature.com API key**: MASTERNEX's academic connector supports Nature; needs API key for non-open-access content.
