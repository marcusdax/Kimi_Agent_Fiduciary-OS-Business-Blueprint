# GitHub Repository Value Scan — Fiduciary OS

**Generated:** 2026-11-08 · **Corpus:** 845 unique repositories from 26 capability queries, then hand-curated and re-verified against the GitHub REST API.

Every star count, licence and last-push date below was read from `api.github.com` on 2026-11-08 and is stored in [`data/curated-repos.json`](../data/curated-repos.json). Reproduce with `node tools/github-scan.mjs && node tools/verify-curated.mjs`.

---

## 1. Method, and its limits

**Two stages, because one is not enough.**

1. **Discovery** (`tools/github-scan.mjs`) — 26 searches mapped to the Fiduciary OS value flow (attract → activate → convert → retain → trust → platform), sorted by stars, archived repositories excluded. Each hit is scored 0–100 on: liveness (last push, 0–30), adoption (log-scaled stars, 0–25), licence permissiveness (0–20), stage fit (0–20), health (0–5). Output: 845 candidates.
2. **Verification** (`tools/verify-curated.mjs`) — a hand-curated shortlist of 39 repositories resolved one-by-one through `/repos/{owner}/{repo}` so the report quotes nothing it did not just read. 38 resolved; 1 did not exist under the expected name.

**Where this method lies to you, and what I did about it:**

| Failure mode | What it looks like in this corpus | Mitigation |
|---|---|---|
| Popularity ≠ fitness | `mimblewimble/grin` (5.1k★, a cryptocurrency) surfaced under a zero-knowledge search | Human curation before publication; the scored list is an input, not an answer |
| Clone farms inflate a query | The portfolio query returns **nine** near-identical copies of Ghostfolio | Treated as one upstream project; clones rejected wholesale |
| Dead repos score well on stars | `jimlindstrom/sec_edgar` (44★) last pushed **2012** | Liveness is 30% of the score, and curated repos are checked for last-push |
| Licence metadata is unreliable | 7 of 39 shortlisted repos return `NOASSERTION` (Langfuse, Twenty, OpenBB, PostHog, GrowthBook, OpenSign, Tax-Calculator) | Never treated as permissive. Each requires a human read of the `LICENSE` file before embedding |
| Star counts are gameable and stale | A 2021 hero repo can outrank a 2026 one | Recency weighted separately; every number is dated |

---

## 2. Seven findings that change what Fiduciary OS should build

### Finding 1 — The ecosystem supplies components; nobody supplies the fiduciary assembly

845 repositories, and not one is a compliant advisory platform you could adopt. There are excellent CRMs, policy engines, tax engines, chart libraries and audit logs — and a large empty space where "suitability evidence, plan provenance, and supervisory review" should be. **That gap is the product.** Adopting components raises the floor fast; the ceiling is still yours to build.

### Finding 2 — AGPL concentrates exactly where the value is

The five most valuable upstreams in this domain are all copyleft:

| Project | ★ | Licence | What it would give you |
|---|---|---|---|
| `openbq-org/OpenBB` | 75,230 | NOASSERTION (AGPL-3.0 in practice) | Multi-provider market data |
| `ghostfolio/ghostfolio` | 9,670 | **AGPL-3.0** | Mature TWR/risk maths on the same stack (NestJS + Prisma) |
| `PolicyEngine/policyengine-us` | 171 | **AGPL-3.0** | Maintained federal + state tax and benefit rules |
| `documenso/documenso` | 15,685 | **AGPL-3.0** | E-signature |
| `trycompai/comp` | 2,086 | **AGPL-3.0** | SOC 2 evidence collection |

**Architectural consequence, not a legal footnote:** every one of these must run as a **separate service behind an API boundary**, never vendored. That means the platform needs a real interface layer (OpenAPI contracts, per-service auth, audit on the boundary) earlier than a monolith would. Budget for it in Phase 1, not Phase 4.

### Finding 3 — Tamper-evident audit trails matured in 2025-26, but for *AI agents*, not for advice

The single most useful thing this scan found that the existing roadmap missed. A cluster of small, active, permissively-licensed projects now implements hash-chained, verifiable decision records:

| Project | ★ | Licence | Mechanism |
|---|---|---|---|
| `Cygnux-Labs/Tracekit` | 595 | MIT | Tamper-evident tracing + policy gates + cross-checks |
| `bkuan001/halo-record` | 85 | Apache-2.0 | Hash-chained runtime records for agents |
| `anivar/decern` | 13 | Apache-2.0 | Deterministic authorisation + tamper-evident audit |
| `quantumpipes/capsule` | 11 | Apache-2.0 | Cryptographically sealed audit records |

None is built for a fiduciary duty. All are close enough to be instructive, and their existence validates the design shipped in [`src/trust/ledger.ts`](../src/trust/ledger.ts) — an append-only, hash-chained evidence ledger with offline verification and subject-scoped sub-chain export. **Recommendation: build the ledger in-house (done, 1 day) and buy nothing in this category**; the interesting part is the schema of what gets recorded, not the hash function.

### Finding 4 — The tax-engine question has no clean free answer, so the answer is "own the table, cross-check the engine"

| Option | Licence | Reality |
|---|---|---|
| `PolicyEngine/policyengine-us` | AGPL-3.0 | Authoritative and maintained; must be a network service. Its public `/us/calculate` endpoint now returns an **SPM-only** payload (verified 2026-11-08), so integrating it means self-hosting, not just calling a URL. |
| `PSLmodels/Tax-Calculator` | NOASSERTION (CC0 in practice) | Embeddable, but a Python microsimulation model — heavy for a Node service, federal-only. |
| `The-Pied-Piper/tax-engine` | Apache-2.0 | 1★, unproven. Not a dependency risk worth taking. |

**Shipped answer:** a versioned, cited federal bracket table (`src/sources/taxTables.ts`, IRS Rev. Proc. 2025-32, cross-checked against a published tabulation) plus a deterministic engine, with PolicyEngine as a self-hosted cross-check in CI rather than a runtime dependency. One correct tax year with a citation beats four guessed ones.

### Finding 5 — "Free market data" is plumbing, not entitlement

`ranaroussi/yfinance` (unresolved in verification — the repo has been renamed or restricted) and OpenBB give you *access*, not *rights*. Every consumer-facing use of Yahoo/Nasdaq data carries display-attribution and redistribution constraints, and both are undocumented endpoints that can change without notice.

The sources you can **cite and stand behind** are the government ones: FRED, US Treasury, SEC EDGAR, BLS, SSA, IRS. That is a strategic insight, not a technical one — **make primary-source provenance the product's trust story**, and treat commercial feeds as an upsell for later.

### Finding 6 — UI differentiation is over; provenance UX is the new differentiation

`shadcn-ui/ui` (127,607★) plus Tremor plus a dashboard shell is now table stakes — every competitor has it, so it decides nothing. What no competitor shows is *where each number came from, as of when, and under what licence*. The design direction that follows: every figure on screen carries an inspectable receipt, and stale data looks visibly stale.

### Finding 7 — Several "obvious" picks in the existing roadmap are decaying

- `tremorlabs/tremor` — last push **2025-10-10**, over a year stale at scan time. Keep as copy-paste snippets, do not build on it as a dependency.
- `jimlindstrom/sec_edgar` — last push **2012**. Dead; use SEC's own JSON APIs instead (which is what the shipped code does).
- `openbq-org/OpenBB` — the organisation renamed from `OpenBB-finance`. Pin by commit, not by URL, or your build breaks silently.

---

## 3. Curated shortlist — what to adopt, and how

Integration mode is the decision that matters:
**EMBED** = copy/vendor into the codebase · **SIDECAR** = run as a separate service (required for AGPL) · **STUDY** = read for design, write your own · **BUY** = commercial contract.

### 3.1 Data and calculation (attract / activate)

| Repo | ★ | Licence | Mode | What it actually gives you | Effort |
|---|---|---|---|---|---|
| `openbq-org/OpenBB` | 75,230 | AGPL-3.0 | SIDECAR | One interface over dozens of market-data providers; replaces a single-vendor Alpha Vantage integration | M |
| `ranaroussi/yfinance` | — | Apache-2.0 (claimed) | STUDY | Reference for Yahoo endpoint behaviour; Python, scrape-based, no entitlement | — |
| `jimlindstrom/sec_edgar` | 44 | none | REJECT | Dead since 2012 | — |

**Shipped instead:** direct, licensed-by-construction clients for FRED, US Treasury, SEC EDGAR (submissions, XBRL company facts, full-text search) and BLS, with provenance on every value. See [REAL_DATA_INTEGRATION.md](REAL_DATA_INTEGRATION.md).

### 3.2 Tax and planning engines

| Repo | ★ | Licence | Mode | Verdict | Effort |
|---|---|---|---|---|---|
| `PolicyEngine/policyengine-us` | 171 | AGPL-3.0 | SIDECAR | Adopt as a **self-hosted** rules service and CI oracle, not a runtime URL | L |
| `PSLmodels/Tax-Calculator` | 317 | CC0 (NOASSERTION) | STUDY | Good open-source precedent for embedding; Python-heavy | L |
| `The-Pied-Piper/tax-engine` | 1 | Apache-2.0 | REJECT | Unproven; a 1★ dependency is a liability | — |

### 3.3 Authorisation and identity (convert-b2b)

| Repo | ★ | Licence | Mode | What it gives you | Effort |
|---|---|---|---|---|---|
| `better-auth/better-auth` | 30,645 | MIT | EMBED | Sessions, 2FA, **multi-tenant organisations** — replaces hand-rolled JWT and the single `role` string | M |
| `openfga/openfga` | 6,112 | Apache-2.0 | SIDECAR | Zanzibar-style relationship authz: *advisor X may view household Y because firm Z assigned them*. Auditable, which `requireRole()` is not | M |
| `cerbos/cerbos` | 4,649 | Apache-2.0 | SIDECAR | Policy-as-code with testable policy units — a lighter alternative to OpenFGA when the model is rule-shaped rather than graph-shaped | S |
| `permitio/opal` | 5,521 | Apache-2.0 | SIDECAR | Real-time policy/data distribution if policy must reach many services | M |

**Recommendation:** Better Auth for identity, OpenFGA for the advisor↔household↔firm graph. Cerbos is the right call only if you decide relationships are better modelled as rules — decide before Phase 3, because migrating authorisation models later is the most expensive rewrite in this list.

### 3.4 AI supervision (trust)

| Repo | ★ | Licence | Mode | What it gives you | Effort |
|---|---|---|---|---|---|
| `langfuse/langfuse` | 37,140 | NOASSERTION (MIT core) | SIDECAR | Trace every prompt/response with user, model, cost, latency — the supervisor's review record | S |
| `promptfoo/promptfoo` | 26,950 | MIT | EMBED (CI) | Eval suites that block unsafe advice output before release | S |
| `confident-ai/deepeval` | 19,363 | Apache-2.0 | EMBED (CI) | Deeper metric-based evaluation (faithfulness, relevancy) | S |
| `NVIDIA/garak` | 9,945 | Apache-2.0 | SIDECAR | Adversarial scanning for prompt injection and jailbreaks | S |

**Recommendation:** all four, but in this order — promptfoo in CI first (cheapest, blocks regressions today), then Langfuse for the supervisory trail, then garak as a quarterly exercise.

### 3.5 Audit, provenance, privacy

| Repo | ★ | Licence | Mode | Verdict |
|---|---|---|---|---|
| `Cygnux-Labs/Tracekit` | 595 | MIT | STUDY | Best reference for tamper-evident tracing; agent-shaped, so adapt rather than embed |
| `bkuan001/halo-record` | 85 | Apache-2.0 | STUDY | Clean hash-chained record design |
| `quantumpipes/capsule` | 11 | Apache-2.0 | STUDY | Sealed-record protocol worth reading |
| `apple/pfl-research` | 359 | Apache-2.0 | STUDY | Federated/private learning simulation — the right basis for cross-firm benchmarks |
| `owkin/FLamby` | 246 | MIT | STUDY | Cross-silo FL benchmark datasets and harness |
| `open-quantum-safe/oqs-provider` | 510 | Apache-2.0 | SIDECAR | OpenSSL 3 PQC provider — the crypto-agility path for a 30-year document vault |
| `semaphore-protocol/semaphore` | 1,097 | MIT | STUDY | Zero-knowledge membership proofs — the basis for "prove eligibility without revealing assets" |

### 3.6 Product surface, growth, delivery

| Repo | ★ | Licence | Mode | Verdict | Effort |
|---|---|---|---|---|---|
| `shadcn-ui/ui` | 127,607 | MIT | EMBED | Default choice; you own the code, which is what white-labelling needs | S |
| `satnaing/shadcn-admin` | 16,610 | MIT | EMBED | Dashboard shell to start the Advisor Command Center | S |
| `tremorlabs/tremor` | 3,692 | Apache-2.0 | EMBED (careful) | Great finance charts; **last push 2025-10** — copy snippets, do not depend | S |
| `PostHog/posthog` | 40,696 | NOASSERTION (MIT core) | SIDECAR | Funnels, flags, experiments, replay in one tool | S |
| `growthbook/growthbook` | 8,575 | NOASSERTION (MIT core) | SIDECAR | Warehouse-native experimentation when PostHog's experiments outgrow you | S |
| `umami-software/umami` | 39,982 | MIT | SIDECAR | Privacy-first analytics if PostHog's footprint is too large | S |
| `taskforcesh/bullmq` | 9,575 | MIT | EMBED | Redis job queue — nightly refresh, AI batch, emails, retries | S |
| `temporalio/temporal` | 24,257 | MIT | SIDECAR | Durable execution for the multi-step planning workflow (which must survive a crash mid-approval) | L |
| `conductor-oss/conductor` | 32,446 | Apache-2.0 | SIDECAR | Alternative workflow engine if you prefer event-driven to durable-execution semantics | L |
| `open-telemetry/opentelemetry-js` | 3,516 | Apache-2.0 | EMBED | Vendor-neutral traces/metrics across API, jobs and AI calls | S |
| `documenso/documenso` | 15,685 | AGPL-3.0 | SIDECAR | E-signature for engagement letters and acknowledgements | M |
| `OpenSignLabs/OpenSign` | 7,237 | NOASSERTION | SIDECAR | Alternative to Documenso; compare licence terms first | M |
| `twentyhq/twenty` | 60,627 | NOASSERTION | STUDY | Reference for a modern CRM object model; do not adopt as the advisor CRM | L |
| `krayin/laravel-crm` | 24,122 | MIT | REJECT | Laravel/PHP — wrong stack for a Node platform | — |
| `trycompai/comp` | 2,086 | AGPL-3.0 | SIDECAR | Open-source path to an actual SOC 2 evidence programme | L |
| `UnicisTech/unicis-platform-ce` | 109 | Apache-2.0 | STUDY | Open GRC platform; useful control taxonomy | M |

---

## 4. Rejected, and why

| Repo / category | Reason |
|---|---|
| The nine `Ghostfolio-*-Open-Source-Wealth-Management-Software` clones | Republished copies of one project with no upstream; a supply-chain risk, not a shortcut |
| `mimblewimble/grin`, `firoorg/firo` and other privacy coins (surfaced by the ZKP query) | Cryptocurrency protocols, not audit technology. The query matched a keyword, not a need |
| `jimlindstrom/sec_edgar` | Dead since 2012 |
| `tremorlabs/tremor` as a dependency | Stale; copy-in snippets only |
| Any "free carrier quote" or insurance-price scraper | Reproduces the current hard-coded-table legal risk in a newer wrapper |
| Material/Ant Design component kits | Fight white-labelling; shadcn's owned-code model is the better fit |
| Copying AGPL code into the platform | Obligates source disclosure to network users. Run as a SIDECAR, always |

---

## 5. What this scan changed in the recommendations

The upstream roadmap already listed ~30 projects. This scan **confirmed** most of it and changed five things:

1. **Added a trust-audit cluster the roadmap lacked** (`Tracekit`, `halo-record`, `decern`, `capsule`) — and concluded the right move is to build the ledger in-house, because the schema of what must be recorded is the defensible part.
2. **Demoted Tremor** from "adopt" to "copy snippets" on staleness.
3. **Corrected the PolicyEngine assumption**: its public calculate endpoint is SPM-only, so "call the hosted API" is not a plan. Self-host it.
4. **Promoted licensing to an architectural constraint**: five of the highest-value upstreams are AGPL, which forces a service-boundary architecture in Phase 1, not Phase 4.
5. **Rejected the commercial-feed-first data strategy** in favour of primary-source (government) data with provenance — cheaper, citable, and it is the differentiator.

---

## 6. Reproduce this report

```bash
node tools/github-scan.mjs        # 26 queries -> data/github-candidates.json (845 repos)
node tools/verify-curated.mjs     # 39 pinned repos -> data/curated-repos.json
```

Both scripts are dependency-free, rate-limit aware, and deterministic in output ordering. Set `GITHUB_TOKEN` to skip the pacing delay.
