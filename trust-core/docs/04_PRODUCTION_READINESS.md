# Production Readiness — scorecard after the remediation pass

**Status at 2026-11-08:** eleven of the twelve gaps identified in the first review are **closed and tested**; one is **partially closed** (state tax, which needs a self-hosted PolicyEngine sidecar, not more code here). Of the four gaps the remediation itself created, **three are now closed** and one remains (shared rate-limit state across hosts).

This document is the scorecard. If a claim is not backed by a command in §1, it does not belong here.

---

## 1. Evidence

Reproducible on a clean checkout.

| Check | Command | Result |
|---|---|---|
| Strict type check | `npm run type-check` | **0 errors** (`strict`, `noUncheckedIndexedAccess`, `erasableSyntaxOnly`) |
| Unit tests | `npm run test:unit` | **205 passed** (10 files, 31 suites) |
| Integration tests (real socket) | `npm run test:integration` | **35 passed** (39 with `FID_OS_LIVE=1`) |
| Full suite | `npm test` | **240 passed, 0 failed** |
| Live provider contracts | `FID_OS_LIVE=1 npm run test:live` | **8 passed** |
| Real-data probe | `npm run probe` | **11/11 required sources healthy** |
| Offline ledger verification | `npm run ledger:verify -- bundle.json --public-key pub.pem` | exit **0** clean / exit **1** tampered, with position |
| Static safety audit | `npm run audit` | **0 findings** across 41 source files (rules tested with planted violations) |
| Runtime dependencies | `package.json` has no `dependencies` | ✅ zero |

Live readings during the pass: 10Y Treasury **4.84%**, CPI YoY **3.72%**, SPY **$735.29** (delayed), 55 annual real equity observations (1972–2026), 10-year real yield **2.61%**.

---

## 2. Gaps closed

| # | Original gap | What was built | Proof |
|---|---|---|---|
| 1 | **Ledger was in memory** — every restart erased the evidence | `FileLedgerStore`: JSONL, append-only, `fsync` per append, torn-tail recovery, **chain verified at boot with refusal to start on tamper**, Ed25519 bundle signing, and `importSealed`-style restore | `tests/unit/platform.test.ts` (6 tests) + the CLI run below |
| 2 | **No authentication** — anyone reaching the port could write evidence | HS256 scoped bearer tokens, per-route scope requirements, actor taken **from the token, never the body**, constant-time signature comparison, TTL ceiling enforced at issue *and* verify | `authentication` suite (7 tests) + `a token without the required scope is forbidden` |
| 3 | **No rate limiting** | Token bucket per subject and route group; `x-ratelimit-*` and `Retry-After` headers; plus a per-provider **concurrency budget** so a user burst cannot become an SEC burst | `rate limiting` suite (4 tests) + header assertion |
| 4 | **Single-process cache** | `CacheStore` interface with `MemoryCache` and `FileCache` (atomic temp+rename, shared across processes on a host, hashed keys so a URL never becomes a filename) | `cache implementations` suite (4 tests) |
| 5 | **No metrics** | Prometheus text exposition: request counters, latency histogram, upstream calls/latency, breaker state, cache events, ledger appends, auth failures, rate-limit rejections — with bounded label cardinality | `metrics exposition` suite (2 tests) + `GET /metrics` |
| 8 | **No ticker → CIK resolver** | EDGAR `company_tickers.json` cached 7 days, normalised to a zero-padded CIK; an unknown ticker is an explicit error, never a guess | `disclosure watch returns filings and links for a real issuer` (live) |
| 9 | **Treasury curve cold start (17–20 s)** | Background warm-up at boot (curve + equity calibration), reported in `/ready`; still cached 24 h with a 45-day stale tolerance and a FRED fallback | `warmUp` state in `GET /ready` |
| 10 | **Suitability and anomaly decisions were not persisted** | Both now append to the ledger with input hashes, verdict and bands — a decision a reviewer cannot reconstruct is not evidence | `suitability ... writes evidence` assertion |
| 11 | **No OpenAPI / no contract test** | The spec is **generated from the route table**, and the contract test asserts both directions (every route documented, every documented operation routed) plus security and scope per operation | `OpenAPI contract` suite (4 tests) |
| 12 | **Yahoo fallback unmonitored** | Every upstream call is now counted and timed with breaker state exported; a degrading provider is visible on a dashboard rather than discovered by a client | `fidos_upstream_calls_total`, `fidos_circuit_breaker_open` |

Two features were also delivered in this pass and are not gap fixes: a **privacy-budgeted cross-firm benchmark** (`src/features/benchmarks.ts`, refuses below five firms) and a **declarative partner-formula sandbox** (`src/features/formula.ts`, grammar with no host access). See [Feature Concepts](02_FEATURE_CONCEPTS.md) F9 and F11.

### The remaining partial

| # | Gap | Now | Remaining |
|---|---|---|---|
| 6 | Tax year coverage | **2025 and 2026**, each with its own citation and a cross-check URL; an unsupported year is a 422 | State income tax still out of scope (listed in every response's `exclusions`); 2027 needs a reviewed table |
 **Closed as a process, not a feed.** 2023 vintage is exposed in provenance; `tools/refresh-mortality.mjs` validates a saved SSA page (row-shape parsing, probability bounds, implausible-jump detection) and `--check` fails on any drift from the shipped table | None in code. Refresh requires a human to save the published page — `ssa.gov` returns 403 to every automated client, and a period life table should change once a year under review anyway |

---

## 3. The offline verification claim, demonstrated

This is the one claim that matters most to a compliance officer, so it is shown rather than asserted:

```
$ node tools/verify-ledger.mjs bundle.json --public-key pub.pem
{ "valid": true, "checked": 2, "headHash": "f9099f8e…", "linkage": "full", "signed": true }
exit 0

# one field altered in the exported JSON:
$ node tools/verify-ledger.mjs bundle.json --public-key pub.pem
{ "valid": false, "brokenAt": 0, "reason": "content hash mismatch at seq 0" }
exit 1
```

No server, no database, no trust in the platform — only the chain and the public key. That is what lets a client file be handed to a third party.

---

## 4. Gaps created by the remediation

Fixing a system changes its risk profile, so the follow-ups are tracked as first-class
items rather than footnotes.

| # | Gap | Status | How |
|---|---|---|---|
| 13 | **Tokens could not be revoked** | ✅ **Closed** | `RevocationRegistry` keeps a deny-list by `jti` (retained only for the token's remaining life) and a per-subject revocation instant, both in the **shared cache** so a second replica honours it immediately. `POST /api/v1/auth/revoke`. A revoked token is refused on the next request with `token_revoked` |
| 14 | **Rate limits and cache are per-host** | ❌ **Open** | Needs Redis behind the existing `CacheStore` interface (≈40 lines with `ioredis`). The interface is the seam; the adapter is a deployment decision |
| 15 | **The vault keyring was in-process** | ✅ **Closed** | `HttpKeyring` loads versioned 32-byte keys from a key service at boot, rejects short keys, fails closed on an unloaded version, and rotates through the service. `/ready` reports `keyring.kind` |
| 16 | **Attestation issuer trust was out of band** | ✅ **Closed** | Every attestation carries a `kid`; `GET /api/v1/attestations/jwks` publishes an Ed25519 JWK Set so a verifier can discover the key |

What remains is genuinely deployment work: TLS termination, WAF, DDoS protection,
backup/restore rehearsal, and the SOC 2 programme itself. None of it is code in this
package, and none of it is claimed.

## 5. Launch gates

A gate is binary: the evidence exists or launch does not happen.

### Gate A — Data integrity
- [x] `npm run probe` → 11/11 required healthy, recorded in release notes
- [x] No `mock`-backed value reachable in production (503 gate)
- [x] Every client-facing number traced to a `DataPoint` in review
- [ ] Licences register reviewed by counsel; no client-facing number depends on undefined-terms data

### Gate B — Evidence
- [x] Ledger append-only, `fsync`-durable, verified at boot, signed
- [x] Offline verification exercised by someone outside engineering
- [ ] Storage-level immutability configured (`chattr +a`, S3 Object Lock, or Postgres with UPDATE/DELETE triggers)
- [ ] Retention policy implemented (7 years; deletion leaves a provable tombstone)
- [ ] KMS-backed signing keys with documented rotation

### Gate C — Advice safety
- [x] Suitability gate on the client-delivery path with `mayShowToClient`
- [x] Missing evidence **blocks** rather than passes
- [ ] Advisor override exists, is possible, and is itself a ledger entry with a reason
- [ ] Rule set signed off by the firm's compliance function (content, not mechanism)

### Gate D — Operations
- [x] SLOs published (§6), metrics exported, `/ready` reports breaker, keyring and ledger state
- [x] A provenance console at `/` renders every figure with its receipt, freshness and licence
- [x] Runbook for provider outage, breaker-open, ledger restore (§7)
- [ ] Alerts wired to a pager, not just a dashboard
- [ ] Backup/restore rehearsed including restore-then-verify

### Gate E — Claims
- [x] No SOC 2 / WCAG / FINRA claim anywhere in this package
- [x] `exclusions` returned on every tax response
- [ ] `exclusions` surfaced in the UI, not only in JSON
- [ ] "Illustrative" rendered on every insurance figure

---

## 6. Service levels

| SLI | Target | Measurement |
|---|---|---|
| Availability (trust core) | 99.9% monthly | Non-5xx ÷ total; 5xx and timeouts count against |
| Latency p95 — deterministic (tax, suitability, anomaly, authz) | < 150 ms | `fidos_http_request_duration_ms` |
| Latency p95 — live-calibrated (retirement, annuity, macro) | < 900 ms warm, < 3 s cold | same, route-labelled |
| Data freshness — macro | ≤ 24 h | `provenance.asOf` vs now |
| Data freshness — quotes | ≤ 60 s | provider timestamp |
| Provider error budget | ≥ 99% successful upstream calls/provider/day | `fidos_upstream_calls_total` |
| Ledger durability | 0 acknowledged-and-lost entries | append vs stored row reconciliation |
| Auth failure rate | < 1% of requests, and any spike pages | `fidos_auth_failures_total` |

**Error-budget policy:** at 50% of a provider's monthly budget, feature work on that provider freezes and stabilisation starts. A provider that cannot be stabilised is demoted to `optional` in the registry, visibly, so the UI degrades rather than lies.

---

## 7. Runbook

### Provider outage
1. `GET /ready` → breaker states, cache size, ledger verification.
2. `GET /api/v1/data-sources` → licence and health register.
3. `npm run probe` → distinguishes "provider down" from "our client broke".
4. Stale-if-error serves macro series for up to 24 h. **Verify `stale` is reaching the UI** so the client sees a freshness badge.
5. Never patch in a default value. A fabricated CPI is worse than a 503.

### Authentication incident (suspected token compromise)
1. Rotate `AUTH_SECRET` → all outstanding tokens become invalid immediately (this is the one advantage of stateless tokens: rotation *is* revocation).
2. Check `fidos_auth_failures_total` and the request log by `sub`.
3. Re-issue scoped tokens to affected users; prefer `ttlSeconds` of 900 rather than 43,200.
4. Ledger entries written during the window are still attributable — the actor came from the token, so the blast radius is bounded by scope.

### Ledger restore
1. Restore the JSONL (or the Postgres rows) to a staging path.
2. `node tools/verify-ledger.mjs bundle.json --public-key pub.pem` — **if verification fails, stop.** A restored ledger that does not verify is a worse state than a missing one, because it looks authoritative.
3. Only then point `LEDGER_DIR` at it and restart. The service verifies again at boot and refuses to start on a break.
4. Record the incident in the ledger itself once it is healthy again.

### Key rotation (vault)
1. `POST /api/v1/vault/rotate` → introduces a new KEK version and re-wraps every data key (32 bytes per document, no blob rewrite).
2. Confirm `integrity.failures` is empty via `GET /api/v1/vault/documents`.
3. Retire the old version only after every document reports the new `keyVersion`.

---

## 8. Security posture

| Control | State |
|---|---|
| Zero runtime third-party dependencies | ✅ |
| Scoped bearer tokens with TTL ceiling | ✅ |
| Actor identity derived from the token, never the body | ✅ |
| Rate limiting + per-provider concurrency budget | ✅ |
| Body size limit (256 KB), `nosniff`, `no-referrer`, `no-store` | ✅ |
| Payloads hashed, never stored, in the evidence ledger | ✅ |
| Ed25519 signed exports, verifiable offline | ✅ |
| AES-256-GCM envelope encryption with versioned KEKs | ✅ |
| Structured logs without PII | ✅ |
| Token revocation (by `jti` or by subject, in the shared cache) | ✅ |
| Remote keyring loaded from a key service at boot, failing closed | ✅ |
| TLS / WAF / DDoS | ❌ deployment |
| Attestation key discovery via JWK Set | ✅ |
| Shared rate-limit state across hosts | ❌ gap 14 |
| SOC 2, PCI, HIPAA | ❌ **not attested, not claimed** |

---

## 9. Cost

Every source used remains free: FRED, Treasury, SEC, BLS, SSA, IRS (public domain) and CoinGecko's free tier. The first real cost is SEC fair-access compliance at scale, then commercial market data if the product ever needs real-time or redistribution rights. The provider abstraction makes that a configuration change plus a contract, not a rewrite.
