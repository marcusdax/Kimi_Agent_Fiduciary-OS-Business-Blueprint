# Adoption Roadmap — sequencing 845 candidates into four shippable phases

The scan found plenty to adopt. This document decides **order**, because order is the only thing that turns a list into a product.

**Sequencing rule used throughout:** a phase may not start until the previous phase's exit criteria are *evidenced*, not asserted. Each phase must produce something sellable or demonstrable, and nothing customer-facing ships ahead of the trust gates.

**Update 2026-11-08:** Phase 0 is complete. Phase 1's engineering is complete except for the UI work (the calculators, Disclosure Watch and the MCP server all ship). Phase 2's platform layer — identity, authorisation graph, the persisted signed ledger, AI-supervision hooks — is built and tested; what remains in Phase 2 is the PDF export and the first paying firm. Phase 3 is now unblocked. The status of each deliverable is marked inline.

---

## Phase 0 — Trust substrate *(shipped in this package, 1 week of work)*

**Why first:** every subsequent feature either depends on provenance or is cheaper to build once provenance exists. Shipping a calculator before this means retrofitting a receipt onto every number later.

| Deliverable | State |
|---|---|
| Provenance envelope on every value, with licence and freshness | ✅ |
| Resilient transport (timeout, retry, breaker, cache, stale-if-error) | ✅ |
| Fail-closed production gate (503, never a fabricated number) | ✅ |
| Cited, versioned tax table with a deterministic engine | ✅ |
| Monte Carlo calibrated from 55 years of real returns | ✅ |
| Annuity priced from the Treasury curve and SSA mortality | ✅ |
| Hash-chained evidence ledger with offline verification | ✅ |
| Suitability gate (evidence-required, blocks client delivery) | ✅ |
| Explainable action-risk scoring | ✅ |
| Data-source registry endpoint + release probe | ✅ |

**Exit criteria:** `npm run probe` 11/11 · 91 unit + 14 integration + 8 live tests green · zero runtime dependencies.

**Business outcome:** the trust story becomes demonstrable. This is what an enterprise security review actually asks about.

---

## Phase 1 — Make the top of funnel earn its keep *(4-6 weeks)* — **engineering complete**

**Adopt:** `shadcn-ui/ui`, `satnaing/shadcn-admin`, `PostHog` (funnel instrumentation), and the shipped calculators.

| Work | Status |
|---|---|
| Rebuild the four calculators on the new engines, with the provenance badge as a first-class UI element | ✅ **Done** — engines plus the console at `/`: every figure carries its receipt, freshness and licence |
| Instrument Attract → Activate → Convert from the first visit | **Not started** — needs PostHog, not code in this package |
| Ship **F7 Disclosure Watch** (SEC full-text per holding) | ✅ **Done** — `POST /api/v1/disclosure-watch`, live-tested |
| Publish the calculators as an **MCP server** (F12) | ✅ **Done** — `npm run mcp`, five tools |

**Do not** build a design system, a CRM, or an onboarding wizard yet.

**Exit criteria:** calculator → registration conversion measured with a baseline; Disclosure Watch in the hands of 5 advisors; every client-facing figure renders its receipt.

---

## Phase 2 — The B2B product *(10-14 weeks)* — **platform layer built**

**Adopt:** `better-auth` (identity, multi-tenant orgs), `openfga` (authorisation graph), `promptfoo` + `langfuse` (AI supervision), `documenso` (sidecar, e-sign).

| Work | Status |
|---|---|
| **F6** Advisor ↔ household ↔ firm authorisation graph | ✅ **Done** — `src/trust/authz.ts`, 13 tests |
| Persist the evidence ledger (gap 1) and sign entries | ✅ **Done** — durable JSONL, Ed25519, boot verification |
| Firm-branded plan export (PDF) carrying its own verifiable ledger sub-chain | **Not started** — the sub-chain plus its signature exists; the PDF does not |
| AI explanations routed through the suitability gate, traced, evaluated in CI | **Partially done** — gate and recording ship; Langfuse/promptfoo wiring is a deployment task |

**Decision to force early:** OpenFGA (graph) vs Cerbos (rules). Both are good; picking late is what hurts.

**Exit criteria:** first paying firm; security questionnaire passed without a bespoke spreadsheet; a revoked grant denies within one request and the ledger proves who granted it.

---

## Phase 3 — Depth that raises price *(3-6 months)* — **unblocked, in progress**

| Work | Adopt | Why |
|---|---|---|
| **F10** Document vault v2 (envelope encryption, rotation, PQC-ready wrapping) | `oqs-provider` later | Turns Premium into something worth paying for; unblocks enterprise data requirements |
| Self-hosted **PolicyEngine** as a rules sidecar | `policyengine-us` (AGPL → sidecar) | State tax + benefits without owning the rules; also becomes the CI oracle for our federal engine |
| **F9** Privacy-preserving benchmarks | `pfl-research`, `FLamby` | ✅ **Mechanism done** (DP mean with a budget); waiting on five participating firms |
| Durable planning workflow | `temporalio/temporal` | A crash mid-approval must not lose the approval, or the evidence |
| **F11** Partner sandbox | — (built in-house) | ✅ **Declarative sandbox done**; arbitrary code still needs a WASM boundary |
| Real SOC 2 programme | `trycompai/comp` (sidecar) | The claim must be earned before it is made |

**Exit criteria:** SOC 2 Type I scheduled; two state-tax jurisdictions live; NRR measured above 100%.

---

## Phase 4 — Scale and attest *(6+ months)*

| Work | Adopt | Note |
|---|---|---|
| Market data breadth | `OpenBB` (AGPL sidecar) | Only when a customer pays for breadth; not before |
| Account aggregation | Plaid or equivalent (commercial) | Contract + cost decision, not an engineering one |
| Portfolio analytics reference | `ghostfolio` (study TWR/risk maths, never copy) | Avoids re-deriving methodology |
| Multi-region, DR, RTO/RPO | — | Per the upstream deployment architecture |
| Observability maturity | `opentelemetry-js` + dashboards | Closes gap 5 |

---

## What not to build, at any phase

| Temptation | Why not |
|---|---|
| A proprietary AI model | The value is in the evidence and the workflow, not in the model; a frontier API plus a deterministic gate beats a bespoke model on cost, latency and auditability |
| An insurance quote engine | Needs a licensed quoting partner first; the current illustrative table is the honest state |
| Paid advisor matching | Changes the revenue model from subscription to placement — a securities question, not a feature |
| A token / credits economy | Rejected in [FEATURE_CONCEPTS.md](02_FEATURE_CONCEPTS.md); creates an incentive to fabricate and a securities exposure |
| A custom design system | `shadcn` is table stakes and already owned-code; differentiation is provenance UX, not buttons |
| Microservices for their own sake | One modular service with clear boundaries until a boundary actually hurts |

---

## Value per engineering week

A rough ranking of the backlog by business value ÷ effort, using the shipped baseline:

| Rank | Item | Effort | Why it ranks here |
|---|---|---|---|
| 1 | F1 ledger persistence | S | Converts a demo property into the enterprise differentiator |
| 2 | F7 Disclosure Watch | S | Sellable in a week; no new data source |
| 3 | F2/F3 surfaced in the UI | S | The trust work exists; make it visible or it earns nothing |
| 4 | F12 MCP distribution | S | A new channel for a week of work |
| 5 | F6 authorisation graph | M | Unblocks all B2B revenue, but expensive if re-done |
| 6 | F10 vault v2 | M | Raises ARPU on Premium |
| 7 | F8 attestations | M | Removes a funnel drop-off; start with signed claims, not SNARKs |
| 8 | F9 benchmarks | L | High NRR impact, high effort; do not start early |
| 9 | F11 sandbox | L | Only worth it once there are partners to sandbox |
| 10 | OpenBB / Plaid breadth | L | Buy when a customer pays for it |
