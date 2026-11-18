# Real Data Integration — every link, verified

**Verified:** 2026-11-08 · **Result:** 11/11 required sources healthy · **Evidence:** [`data/probe-results.json`](../data/probe-results.json), regenerate with `node tools/probe-real-data.mjs`

This document answers one question a due-diligence reviewer will ask: *"Which numbers in this product come from somewhere real, and can you prove it?"*

---

## 1. The principle

> A financial product should not be able to show a number it cannot source.

That is stronger than "don't use mock data". It means the *shape* of the code has to make provenance structural rather than decorative. Three rules follow:

1. **Every value is a `DataPoint<T>`** carrying provider, citation URL, observation date, retrieval time, licence, method and staleness horizon (`src/provenance.ts`).
2. **Derived values name their inputs.** A 10-year real yield says it came from `DGS10 − T10YIE`; a tax figure cites the Revenue Procedure and the user's inputs.
3. **The production gate is per-value, not per-response.** `assertServed` refuses a `mock`-backed value with HTTP 503 when `NODE_ENV=production`, so a placeholder can never be dressed as live data.

---

## 2. Verified sources

All timings are from the run recorded in `data/probe-results.json`. Latency includes cold DNS/TLS.

| # | Source | Endpoint | Auth | Latency | Backs | Licence posture |
|---|---|---|---|---|---|---|
| 1 | **FRED** — 10Y Treasury | `fredgraph.csv?id=DGS10` | none | 123 ms | Discount anchor, bond leg | Public domain (Federal Reserve) |
| 2 | **FRED** — CPI-U | `fredgraph.csv?id=CPIAUCSL` | none | 81 ms | Inflation, deflating to real dollars | Public domain (BLS via FRED) |
| 3 | **FRED** — 10Y breakeven | `fredgraph.csv?id=T10YIE` | none | 251 ms | Real yield = DGS10 − T10YIE | Public domain |
| 4 | **FRED** — Nasdaq Composite | `fredgraph.csv?id=NASDAQCOM` | none | 91 ms | 55 years of real equity returns for the bootstrap | Public domain (Nasdaq via FRED) |
| 5 | **Treasury Fiscal Data** | `fiscal_service/v2/accounting/od/avg_interest_rates` | none | 559 ms | Fiscal context | Public domain (Treasury) |
| 6 | **Treasury** — par yield curve | `daily-treasury-rates.csv` | none | **17.2 s cold** | Annuity discount factors | Public domain (Treasury) |
| 7 | **SEC EDGAR** — submissions | `data.sec.gov/submissions/CIK*.json` | UA required | 99 ms | Filing history, disclosure calendar | Public filings; fair-access policy |
| 8 | **SEC EDGAR** — XBRL facts | `data.sec.gov/api/xbrl/companyfacts/CIK*.json` | UA required | 134 ms (3.8 MB) | Primary-source fundamentals | Public filings |
| 9 | **SEC EDGAR** — full text | `efts.sec.gov/LATEST/search-index` | UA required | 438 ms | Disclosure Watch (F7) | Public filings |
| 10 | **BLS** — CPI | `api.bls.gov/publicAPI/v2/timeseries/data/` | none | 316 ms | Independent second path to CPI | Public domain (BLS) |
| 11 | **Yahoo Finance** | `query1.finance.yahoo.com/v8/finance/chart` | none | 160 ms | Quote fallback, price history | **Undocumented** — replaceable, display-only |
| 12 | **CoinGecko** | `api.coingecko.com/api/v3/simple/price` | none | 120 ms | Crypto sleeve | Attribution required, no redistribution |
| 13 | **Frankfurter** (ECB) | `api.frankfurter.dev/v1/latest` | none | 112 ms | FX for multi-currency | Free, ECB reference rates |
| 14 | **World Bank** | `api.worldbank.org/v2/...` | none | 157 ms | Macro context only | CC BY-4.0 — attribution required |

**Bundled official tables** (no live endpoint can be trusted for these — see §3):

| Source | Artefact | Citation | Refresh |
|---|---|---|---|
| IRS 2026 federal parameters | `src/sources/taxTables.ts` | Rev. Proc. 2025-32 | Annual, reviewed code change |
| SSA period life table 2023 | `src/data/ssa-period-life-table-2023.json` | `ssa.gov/oact/STATS/table4c6.html` | Annual, with the Trustees Report |

---

## 3. Three sources that look free and are not

### 3.1 SSA returns 403 to every automated client

Probed with a bot UA **and** a browser UA: both `403 Access Denied` (a bot manager). The mortality table is therefore shipped as a versioned artefact with its citation.

**Why that is the correct answer, not a workaround:** a period life table is published once a year and a mid-year change would be *wrong* to pick up silently. An advisory model must be able to say which vintage it used. Treating a published statistical table as a live feed is how two runs of the same projection quietly disagree.

### 3.2 Stooq is both unavailable and unlicensed

`404` plus a bot interstitial, and redistribution terms that are undefined. Not a source to build a client-facing price on.

### 3.3 PolicyEngine's public calculate endpoint no longer computes tax

Worth flagging because the upstream roadmap recommends "call PolicyEngine's hosted API". Verified 2026-11-08: `POST /us/calculate` returns **HTTP 200 but only echoes the household** plus SPM provenance (`spm-calculator 1.0.0`). No `income_tax`, no `taxable_income`, regardless of the `outputs` or `variables` parameters tried.

**Consequence:** the roadmap's "call the hosted API" step does not work. Integrating PolicyEngine means **self-hosting it** (AGPL → separate service), which is a Phase-4 effort, not a Phase-1 one. Meanwhile the shipped deterministic engine uses a cited bracket table.

---

## 4. The production hazards this integration actually has

Each of these was observed, not imagined.

| Hazard | Observed | Mitigation in code |
|---|---|---|
| **The Treasury curve CSV takes 17-20 s cold** | 17,247 ms | 24 h cache, 45 s ceiling, 45-day stale tolerance, and a FRED fallback so a client request never waits on it |
| **Nasdaq quote endpoint is unreliable** | timed out at **45 s** in one probe, 24 s in another | Tiered provider: Nasdaq → Yahoo fallback, 8 s timeout, `timeliness: 'delayed'` on every quote |
| **SEC requires a descriptive User-Agent** | works with one, blocked without | `SEC_USER_AGENT` env var, documented in the data-source registry |
| **FRED returns a ZIP for multi-series requests** | `?id=DGS10,DGS2` returns `PK…` | One series per request; HTTP cache does the deduplication |
| **BLS returns HTTP 200 on failure** | `REQUEST_NOT_PROCESSED` | Status checked in the body; treated as a data error, never retried as transport |
| **SEC XBRL payloads are 3.8 MB** | 3,859,564 bytes | 12 h cache, 20 s timeout, never on a synchronous UI path |
| **CoinGecko free tier rate-limits hard** | 429 under concurrency | 60 s TTL, single-flight cache, no per-user fan-out |
| **Yahoo is undocumented and can vanish** | works today | Marked as a *fallback* in provenance with a licence caveat, not a primary source |

The transport that handles all of this is `src/http.ts`: per-attempt timeout, bounded retry with full-jitter backoff, `Retry-After` respect, per-host circuit breaker, TTL cache, and **stale-if-error** (serve this morning's CPI rather than fail a retirement projection — and tell the caller via `stale: true`).

---

## 5. What each engine actually consumes

| Engine | Inputs | Live? | If a source is down |
|---|---|---|---|
| `tax.ts` | IRS 2026 table (bundled) + user inputs | no | Cannot fail; table is in the build and refuses unknown years |
| `montecarlo.ts` | FRED Nasdaq + CPI → 55 annual real returns; `DGS10 − T10YIE` → bond real yield | yes | 24 h cache; stale-if-error up to 7 days; if still unavailable, **the request fails** rather than using a default return assumption |
| `annuity.ts` | Treasury par curve → bootstrapped DFs; SSA qx | curve live, mortality bundled | Treasury CSV → FRED curve fallback → typed error |
| `suitability.ts` | Plan facts + rule set | no | Deterministic; cannot fail |
| `anomaly.ts` | Action + client context + history | no | Deterministic |
| `ledger.ts` | Write path, SHA-256 | no | Cannot fail (in-memory; see production readiness §4) |

**The deliberate refusal:** there is no `DEFAULT_EQUITY_RETURN = 0.07` anywhere in this codebase. If calibration fails, the projection fails with a typed error. A projection built on a guessed return is indistinguishable from one built on data unless the code refuses to guess.

---

## 6. Licence register

| Source | Redistribution | What we may do | Constraint we honour |
|---|---|---|---|
| FRED / BLS / Treasury / SEC / SSA / IRS | Public domain (US Gov) | Store, derive, display, redistribute | SEC fair-access: UA + ≤10 req/s |
| CoinGecko | Proprietary terms | Display with attribution | No redistribution as a data feed |
| Nasdaq | Delayed display data | Display, labelled delayed | Not licensed for redistribution; not a settlement price |
| Yahoo | Undocumented | Fallback display only | Treated as replaceable; never the sole source of a client-facing number |
| World Bank | CC BY-4.0 | Any use with attribution | Attribution required |
| PolicyEngine | AGPL-3.0 | Call as a network service | Never vendor the source |

**Rule adopted:** no client-facing number may depend on a source whose redistribution terms are undefined. That is why Stooq was rejected and why Yahoo is a fallback rather than a primary.

---

## 7. Operating it

```bash
npm run probe                  # human table; non-zero exit blocks a release
node tools/probe-real-data.mjs --json   # writes data/probe-results.json
npm run test:live              # contract tests against every provider
GET /api/v1/data-sources       # runtime registry: what backs what, licence, breaker state
```

**On-call playbook for a data incident:**

1. `GET /api/v1/data-sources` → read `health` (breaker states) and `cache`.
2. `npm run probe` → distinguishes "provider down" from "our client broke".
3. `npm run test:live` → tells you *which* contract changed, if the provider altered its schema.
4. If the provider is down and the cache is cold: the endpoint returns `503 upstream_circuit_open`. That is correct behaviour — **do not** patch in a default value.

---

## 8. What is still not real data (and must be labelled as such)

Being explicit is the point of this section.

| Area | State | Honest label |
|---|---|---|
| Insurance carrier quotes | **No carrier integration.** No licensed quoting partner. | `illustrative` — never a quote |
| Bank account aggregation | **Not implemented.** No Plaid or equivalent contract. | holdings are user-entered (`user-input`) |
| Advisor matching | **Not paid matching, by design.** | n/a |
| State income tax | Out of scope in `tax.ts` | listed in `exclusions` on every response |
| Social Security benefit estimate | User-supplied, not from an SSA statement | `user-input` |
| Document vault files | Not implemented (metadata only upstream) | F10 in [FEATURE_CONCEPTS.md](02_FEATURE_CONCEPTS.md) |

Any screen showing one of these must render the corresponding label. The `SourceKind` type exists so that requirement is enforceable rather than aspirational.
