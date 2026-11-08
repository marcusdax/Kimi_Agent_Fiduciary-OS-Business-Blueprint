# Fiduciary OS — Value Add: GitHub scan, feature design, and a production trust core

This package takes the two source documents (the Fiduciary OS master docs and the MASTERNEX.os blueprint) plus a scan of 845 GitHub repositories, and turns them into **working, tested software** rather than a recommendation list.

It is a drop-in module, a service, an MCP server, and an audit trail of how each decision was reached.

---

## The problem it fixes

The upstream prototype is honest about its own weakness:

> "Calculators: **Rule-of-thumb formulas**… `/retirement` maps withdrawal rate to a **fixed success percentage**… `/calculations/tax` hard-codes one year's brackets and applies **single** brackets to head-of-household filers."

A fiduciary product cannot ship a lookup table wearing a percentage sign, and it cannot say "live data" when the label describes a whole response rather than each number. Those are what this package solves — and then it closes the operational gaps that made the first version demo-grade rather than deployable.

---

## What is in the box

### Data and maths

| Component | What it does | Evidence |
|---|---|---|
| **Provenance bus** | Every value carries provider, citation URL, observation date, licence, method and staleness. `mock` is refused with 503 in production. | `src/provenance.ts` · asserted across the transport, tax and ledger suites |
| **Resilient transport** | Timeout, jittered retry, `Retry-After`, per-host circuit breaker, per-host concurrency budget, TTL cache, stale-if-error | `src/http.ts` · 11 tests |
| **Real data sources** | FRED, US Treasury, SEC EDGAR (submissions, XBRL, full-text, ticker→CIK), BLS, Nasdaq, Yahoo, CoinGecko, ECB FX, World Bank | `src/sources/*` · 8 live contract tests |
| **Tax engine** | 2025 **and** 2026 federal, each cited to its Revenue Procedure: per-status brackets, age-65 + OBBBA senior deduction with phaseout, LTCG stacked on ordinary income, NIIT, explicit exclusions | `src/engines/tax.ts` · 21 tests |
| **Retirement engine** | Seeded 5-year block-bootstrap Monte Carlo over **55 years of real equity returns** deflated by CPI; bond leg at the live 10-year real yield; solves the 90%-success spending level | `src/engines/montecarlo.ts` · part of 28 engine tests |
| **Annuity engine** | Actuarial present value from bootstrapped Treasury discount factors × SSA survival, with joint/survivor, COLA, deferral and load | `src/engines/annuity.ts` · part of 28 engine tests |

### Trust and evidence

| Component | What it does | Evidence |
|---|---|---|
| **Evidence ledger** | Append-only hash chain, **durable** (JSONL + `fsync`), **verified at boot with refusal to start on tamper**, Ed25519-signed exports, subject sub-chains, offline verification CLI | `src/trust/ledger.ts` + `src/store/ledger-store.ts` · 16 tests |
| **Suitability gate** | Deterministic cited rules; missing evidence **blocks** rather than passes; gates client delivery; records the decision to the ledger | `src/trust/suitability.ts` · 6 tests |
| **Action risk sentinel** | Explainable elder-exploitation / authority-misuse scoring with published weights | `src/trust/anomaly.ts` · 6 tests |
| **Authorisation graph** | Zanzibar-shaped firm → advisor → household → document relationships, with traversal-justified decisions and immediate revocation | `src/trust/authz.ts` · 13 tests |
| **Attestations** | Signed threshold claims + salted commitments: prove "assets ≥ $1M" without disclosing assets | `src/trust/attestations.ts` · 7 tests |
| **Vault** | AES-256-GCM envelope encryption, versioned KEKs, blob-free rotation, verified restore | `src/security/vault.ts` · 8 tests |
| **Disclosure Watch** | Per-holding SEC filings + risk-language monitoring from primary sources; links, never summaries | `src/features/disclosure-watch.ts` · live-tested |
| **Benchmarks** | Differentially private cross-firm means: k-anonymity, clipped sensitivity, Laplace noise, a spent privacy budget, and refusal below five firms | `src/features/benchmarks.ts` · 7 tests |
| **Partner formulas** | A declarative calculator sandbox: partners submit a formula, not code — no property access, no host objects, bounded tokens/depth/operations, evaluated with a trace | `src/features/formula.ts` · 9 tests |

### Platform

| Component | What it does | Evidence |
|---|---|---|
| **HTTP service** | Dependency-free API, consistent error contract, request ids, **scoped bearer auth**, **token-bucket rate limits**, **Prometheus metrics**, **generated OpenAPI** | `src/server.ts` + `src/routes.ts` · 22 integration tests |
| **MCP server** | Five calculators exposed to assistants over JSON-RPC, each carrying provenance and the disclaimer | `src/mcp/server.ts` · 7 tests · verified over stdio |
| **Provenance console** | A served UI where every figure renders with its receipt: source, observation date, freshness, licence and method. Placeholder or unverifiable values are visibly flagged | `src/ui/*` · 18 tests · strict CSP, no inline script |
| **Static audit** | Rules against markup injection, dynamic code execution, process spawning, checked-in secrets, stray logging and undocumented modules — each tested with a planted violation | `tools/audit.mjs` · 11 tests |

**Zero runtime dependencies.** `typescript` and `@types/node` are dev-only, and `npm run verify` gates on a static audit before it runs a single test. This process sits in front of every number a client sees, so its supply-chain surface is deliberately empty.

---

## Verified results

```
type-check      strict + noUncheckedIndexedAccess   0 errors
unit tests                                           205 passed  (10 files, 31 suites)
integration tests (real socket)                       35 passed  (39 with FID_OS_LIVE=1)
live provider contract tests                           8 passed
real-data probe                                      11/11 required healthy
offline ledger verification                          exit 0 clean / exit 1 tampered
runtime dependencies                                   0
```

Live readings at the time of writing: 10Y Treasury **4.84%**, CPI YoY **3.72%**, SPY **$735.29** (delayed), **55** annual real equity observations (1972–2026), 10-year real yield **2.61%**.

---

## Quick start

Requires Node 22.6+ (native TypeScript type-stripping; developed on Node 24).

```bash
npm install            # dev-only: typescript, @types/node
npm run verify         # type-check + static audit + 240 tests
npm run probe          # verify every external data source

npm run mcp            # calculators over MCP (stdio) for an assistant
npm start              # HTTP on :8080, console at http://127.0.0.1:8080/
```

`npm start` now requires configuration it can no longer invent:

```bash
export AUTH_SECRET="$(openssl rand -hex 32)"       # 32+ chars; tokens are HS256
export LEDGER_PRIVATE_KEY="$(base64 -w0 key.pem)"  # Ed25519, so exports can be authenticated
export LEDGER_PUBLIC_KEY="$(base64 -w0 pub.pem)"
export LEDGER_DIR=/var/lib/fiduciary-os/ledger     # append-only volume
export NODE_ENV=production
```

In development those are generated for you, with a warning.

Issue a scoped token (development only — production uses your identity provider):

```bash
TOKEN=$(curl -s -X POST localhost:8080/api/v1/auth/token -H 'content-type: application/json' \
  -d '{"sub":"advisor:1","scopes":["calc:read","ledger:read","ledger:write","advice:write"]}' | jq -r .token)

curl -s -X POST localhost:8080/api/v1/calculations/tax -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"taxYear":2026,"filingStatus":"married","ordinaryIncome":145000,"preferentialIncome":22000}'
```

Every response is `{ data, provenance }`. Read the `provenance` block: it is the product.

Open `http://127.0.0.1:8080/` for the console: every figure renders with its receipt, and a value that is not live is flagged rather than shown.

Prove an exported client file was not altered, with no access to the server:

```bash
curl -s localhost:8080/api/v1/ledger/export > bundle.json
npm run ledger:verify -- bundle.json --public-key pub.pem
```

---

## API surface

| Endpoint | Scope | What it answers |
|---|---|---|
| `GET /health` · `/ready` · `/metrics` · `/openapi.json` | public | Liveness, readiness (breakers, cache, ledger), Prometheus, spec |
| `GET /api/v1/data-sources` | public | Every dependency, its licence and its health |
| `GET /` · `GET /console` | public | The provenance console (strict CSP, no inline script) |
| `POST /api/v1/auth/token` | public (dev) | Issue a scoped token; disabled in production |
| `POST /api/v1/auth/revoke` | `admin` | Kill one token by `jti`, or every token for a subject |
| `POST /api/v1/calculations/tax` | `calc:read` | Federal tax with citation and exclusions |
| `GET /api/v1/calculations/tax/years` | `calc:read` | Supported years and their citations |
| `POST /api/v1/calculations/retirement` | `calc:read` | Monte Carlo calibrated from live FRED data |
| `POST /api/v1/calculations/annuity` | `calc:read` | Treasury curve × SSA mortality |
| `GET /api/v1/macro` | `calc:read` | Inflation, yields, curve spread, implied real yield |
| `POST /api/v1/suitability/assess` | `advice:write` | Deterministic gate; records the decision |
| `POST /api/v1/anomaly/assess` | `calc:read` | Action risk with named signals |
| `POST /api/v1/disclosure-watch` | `calc:read` | SEC filings + risk language per holding |
| `POST /api/v1/ledger/entries` · `GET /head` · `GET /export` · `POST /verify` · `GET /subject/:id` | `ledger:*` | Evidence trail and its verification |
| `POST /api/v1/authz/tuples` · `/check` · `GET /objects/:subject` | `authz:*` | Firm → advisor → household access |
| `POST /api/v1/attestations` · `/verify` · `GET /public-key` · `GET /jwks` | `admin` / `calc:read` | Prove a threshold without the value; publish the verification key |
| `POST /api/v1/vault/documents` · `GET /documents` · `POST /rotate` | `admin` | Envelope-encrypted document storage |
| `POST /api/v1/partners/formulas` · `GET /partners/formulas` · `POST /partners/formulas/:id/evaluate` | `admin` / `calc:read` | Register and run a partner calculator safely |
| `POST /api/v1/benchmarks/publish` · `GET /benchmarks/budget` | `admin` / `calc:read` | Cross-firm benchmark, or a refusal that explains why |

There is no separate document: `GET /openapi.json` is **generated from the route table**, and a contract test asserts both directions.

---

## Security model in one paragraph

Every non-public route requires a scoped HS256 bearer token; the acting identity is taken from the token, never from the request body. Tokens are revocable by `jti` or by subject, and the deny-list lives in the shared cache so a second replica honours it on the next request. Rate limits are token buckets per subject and route group, plus a per-provider concurrency budget so a user burst cannot become an SEC burst. Ledger payloads are hashed, never stored, and exports are Ed25519-signed so a third party can verify them offline. Documents are sealed with per-document AES-256-GCM keys wrapped by a versioned KEK loaded from a key service at boot (failing closed if it is unavailable), so rotation never rewrites a blob. Attestation keys are published as a JWK Set, so a verifier discovers them instead of being handed a PEM out of band. The remaining gaps — token revocation, multi-host limits, KMS — are named in [Production Readiness §4](docs/04_PRODUCTION_READINESS.md).

---

## What changed versus the upstream prototype

| Area | Before | After |
|---|---|---|
| Tax | 2024 brackets, single-filer bands applied to HoH, no NIIT, no age-65 deduction | 2025 + 2026 bands with citations, correct per status, senior deduction with phaseout, LTCG stacking, NIIT, exclusions listed |
| Retirement | `if (rate <= 4) success = 95` | Seeded block-bootstrap over real returns, real bond yield, solved sustainable spending |
| Annuity | `principal × 5.5% × (1 + deferral × 1.5%)` | Treasury discount factors × SSA survival, with joint/COLA/deferral/load |
| Data provenance | one `source` string per response | per-value provenance with citation, date, licence and staleness |
| Audit trail | DB rows an admin can rewrite | durable hash chain, signed, verified at boot, verifiable offline |
| Advice safety | prompt-level guardrails | deterministic gate that blocks client delivery on missing evidence |
| Authorisation | one `role` string | firm → advisor → household → document relationship graph |
| Documents | metadata only, no encryption | envelope encryption, versioned keys, verified restore |
| Failure behaviour | mock data or a default assumption | typed error / 503, never a fabricated number |

---

## Repository layout

```
src/                the production module (zero runtime dependencies)
src/sources/        one file per provider; every one returns a DataPoint
src/engines/        deterministic maths: tax, Monte Carlo, annuity, mortality
src/trust/          ledger, suitability, anomaly, authz, attestations
src/security/       auth, rate limiting, vault
src/store/          append-only ledger storage
src/features/       Disclosure Watch
src/mcp/            MCP server and its stdio entry point
src/observability/  metrics registry
tests/unit          fast, hermetic, no network
tests/integration   real HTTP handler over a real socket
tests/live          contract tests against the real providers (opt-in)
tools/              scan, probe, offline ledger verification
docs/               the five documents below
upstream/           read-only copy of the source repository, for diffing
```

`--test-isolation=none` is used so all suites run in one process against the native
TypeScript type-stripper: no build step, no transpiler, no child processes.

---

## Documentation

| Document | What it answers |
|---|---|
| **[GitHub Repository Value Scan](docs/01_GITHUB_REPO_VALUE_SCAN.md)** | 845 repos scanned, 39 pinned, 35 recommended with licence and integration mode, 7 findings that change the build order |
| **[Feature Concepts](docs/02_FEATURE_CONCEPTS.md)** | 12 features traced to the source documents — all 12 shipped, 4 rejected with reasons |
| **[Real Data Integration](docs/03_REAL_DATA_INTEGRATION.md)** | Every endpoint, its licence, its measured latency, and the hazards observed in production |
| **[Production Readiness](docs/04_PRODUCTION_READINESS.md)** | The scorecard: 10 gaps closed, 2 partial, **4 new ones created by the fix and named**, launch gates, SLOs, runbook |
| **[Adoption Roadmap](docs/05_ADOPTION_ROADMAP.md)** | Four phases with exit criteria, and a value-per-engineering-week ranking |

---

## Honest status

Eleven of the twelve gaps from the first review are closed and tested; state tax is the one partial, because it needs a self-hosted PolicyEngine sidecar rather than more code here. Of the four gaps the remediation itself created, three are closed (revocation, remote keyring, key discovery); shared rate-limit state across hosts still needs Redis. Deployment items (TLS, WAF, KMS, backup rehearsal, SOC 2) remain, and nothing here claims a certification.

It is also not legal, tax or investment advice. The suitability rules are a mechanism, not a legal opinion; the firm's compliance function owns their content.
