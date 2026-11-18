# Feature Concepts — from the two source documents to a shippable backlog

**Inputs:** the Fiduciary OS master documentation (the Google Doc suite, mirrored in this repo's `upstream/`) and the MASTERNEX.os v6.1 blueprint (the second Google Doc). Where they conflict, Fiduciary OS wins on domain truth and MASTERNEX wins on security primitives.

All twelve features are **shipped and tested** in this package. Four ideas from the MASTERNEX document are **rejected**, with reasons — that is part of the deliverable.

---

## How to read an entry

`Origin` says which document motivated it. `Shipped` means code exists, tests pass, and a contract is documented. Every entry ends with the metric it is supposed to move, because a feature that moves no metric is a hobby.

---

# Shipped

## F1 · Evidence Ledger — an append-only, verifiable record of advice

**Origin:** MASTERNEX *ACP-SQL Immutable Ledger* ("protocol-first security: no execution without logging"), re-scoped to fiduciary duty.
**Shipped in:** `src/trust/ledger.ts` · 10 tests

**The problem.** A fiduciary's defence is a contemporaneous record. The prototype stores planning actions in a database that an administrator can rewrite, and a client who exports their file has no way to show it was not edited afterwards.

**What it does.** Every high-consequence action (plan created, stage advanced, authority granted/revoked, evidence attached, advice generated/reviewed, data exported) is appended to a hash chain. Each entry commits to its predecessor, its actor, its subject, and a SHA-256 of the sensitive payload. Correcting history means appending a `supersedes` entry; there is no update or delete path.

**Why it is structured this way.**
- **Payloads are hashed, never stored.** The ledger must not become a second copy of client data — that would make it a breach multiplier and a GDPR liability.
- **Verification is offline.** `verifyBundle` takes only exported JSON, so a third party (an examiner, a buyer, a client) can confirm integrity without trusting the server.
- **Subject sub-chains are exportable.** A client file can carry its own slice, anchored to history the client cannot see, without leaking other clients' existence.

**Failure modes handled.** Edited entry → named position; deleted middle entry → sequence gap; truncated tail → head-hash mismatch; spliced sub-chain → reported as `per-entry` linkage rather than a false "verified".

**API.** `POST /api/v1/ledger/entries` · `GET /ledger/head` · `GET /ledger/export` · `POST /ledger/verify` · `GET /ledger/subject/:id`

**Metric.** Enterprise close rate (a signed, verifiable client file is the artefact an RIA's compliance officer needs before they will approve a new system).

**Next.** Persist to an append-only store with per-entry KMS signing, and add a daily head-hash notarisation to an external timestamp authority so "the server was honest all along" is provable to a third party.

---

## F2 · Provenance Bus — every number carries its receipt

**Origin:** Fiduciary OS's own `source: 'live' | 'mock'` design, promoted from a response field to a first-class type.
**Shipped in:** `src/provenance.ts`, `src/http.ts`, `src/calibration.ts` · 11 transport tests + assertions across the engine and ledger suites

**The problem.** The prototype labelled a whole response as "live" or "illustrative". But a retirement projection mixes a Treasury yield (today), a CPI series (last month), a mortality table (2023), a tax year (2026) and the user's own inputs. One label cannot describe that, so the label was decorative.

**What it does.** `DataPoint<T>` pairs a value with: provider key, source kind (`live` / `bundled-official` / `derived` / `user-input` / `mock`), citation URL, retrieval time, observation date, licence, a plain-language method, staleness horizon, and the sources it was derived from. A sealed `assertServed` gate refuses `mock` in production with HTTP 503.

**The insight that makes it product, not plumbing.** Licence and freshness travel with the number. The UI can therefore answer "is this figure fit to show a client?" without a lookup table, and a supervisor can reconstruct any screen a client saw.

**Metric.** Support tickets of the form "where did this number come from" → target zero; and audit-finding count at first SOC 2 / SEC exam.

---

## F3 · Suitability Gate — the deterministic check an LLM cannot bypass

**Origin:** Fiduciary OS's "AI never recommends" guardrails, hardened into a rules engine.
**Shipped in:** `src/trust/suitability.ts` · 6 tests

**The problem.** A fluent AI explanation is indistinguishable from a suitability opinion to a hurried human. Prompt-level guardrails fail open when the model is updated.

**What it does.** Rules live in **data**, each with an id, severity, basis, citation, and an evaluator returning `pass` / `fail` / **`insufficient-evidence`**. Missing evidence is **blocking**, because "we could not check" and "we checked and it was fine" must never collapse into the same state. The output has `mayShowToClient`, so client delivery is gated on evidence rather than on an author's confidence.

**Rules shipped.** Horizon/equity fit · stress-loss tolerance · liquidity reserve before illiquid commitments · concentration disclosure · funded ratio · cost reasonableness · vulnerable-client escalation.

**Why rules and not a model.** A compliance officer must be able to read a rule, contest it, and change it without a deployment. That constraint decides the architecture.

**Metric.** Suitability exceptions per 100 plans reviewed; time-to-approve a plan.

---

## F4 · Action Risk Sentinel — elder-exploitation and authority-misuse detection

**Origin:** MASTERNEX *NADE* anomaly engine, translated from sensor spikes to financial exploitation.
**Shipped in:** `src/trust/anomaly.ts` · 6 tests

**The problem.** RIAs carry a reporting duty for suspected elder financial exploitation, and the classic signals — a beneficiary change, a new third party, a large outflow, a client who has not logged in for a year — are all visible in the platform's own event stream and currently ignored.

**What it does.** A **weighted, published** rule set scores each planning action against client-specific baselines (an $80k withdrawal is unremarkable for one household and a red flag for another; the ratio carries the information, not the amount). Output: score, band, recommended action, and every contributing signal with its basis — plus an explicit list of what the scorer *cannot* see.

**Why explainable.** A score that cannot be contested is unusable in a regulated domain. Every point is attributable, and the weights are exported as data so recalibration against adjudicated outcomes is a config change.

**Metric.** True-positive rate on adjudicated cases; median time from signal to advisor contact.

**Next.** Backtest against a labelled year of historical actions; only then tune weights.

---

## F5 · Real-calibrated projection engines — replacing the lookup table that wore a percentage sign

**Origin:** Fiduciary OS's own admission that its calculators are "rule-of-thumb formulas".
**Shipped in:** `src/engines/tax.ts`, `montecarlo.ts`, `annuity.ts`, `mortality.ts` · 49 tests (21 tax + 28 engines)

Three separate upgrades, all fed by primary-source data:

| Calculator | Before | After | Data source |
|---|---|---|---|
| **Tax** | 2024 brackets, single-filer brackets applied to head-of-household, no NIIT, no age-65 deduction | 2026 brackets with citation, correct per-status bands, standard + age-65 + OBBBA senior deduction with phaseout, LTCG stacked on ordinary income, NIIT, explicit exclusions list | IRS Rev. Proc. 2025-32 (bundled, cited) |
| **Retirement** | `if (withdrawalRate <= 4) success = 95` | Seeded 5-year **block-bootstrap Monte Carlo** over 55 years of real equity returns deflated by CPI, bond leg at the current 10-year real yield, plus a bisection solve for the 90%-success spending level | FRED `NASDAQCOM` + `CPIAUCSL`, `DGS10` − `T10YIE` |
| **Annuity** | `principal × 5.5% × (1 + deferral × 1.5%)` — identical for a 60- and 80-year-old | Actuarial present value: bootstrapped Treasury discount factors × SSA survival, with joint/survivor, COLA, deferral and load options | US Treasury par curve + SSA period life table |

**The business point.** These are the only numbers a household actually reads. Making them defensible is what converts a calculator into something an advisor will put their name next to — which is the B2B wedge.

**Metric.** Calculator → registration conversion; advisor-reported "would you show this to a client?" (target: yes).

---

# Designed

## F6 · Advisor ↔ Household ↔ Firm authorisation graph  ✅ SHIPPED

**Origin:** Fiduciary OS B2B requirement; the prototype has a single `role` string on a user.
**Shipped in:** `src/trust/authz.ts` · 13 tests
**Built:** a Zanzibar-shaped tuple graph — `user member firm`, `firm serves household`, `household parent document` — with membership expansion, bounded parent traversal (a cycle returns *depth exceeded* rather than hanging), `serves` as a real grant, revocation that takes effect on the next check, and a decision that always returns the traversal it used. Every grant is a ledger entry.
**Problem.** "Which advisor may see which household, on whose authority, and for how long" is the core B2B object model, and a boolean role cannot express it. Getting this wrong is a data-breach class of bug.
**Design.** Better Auth for identity (multi-tenant orgs, 2FA) + OpenFGA for relationships: `firm#member → advisor`, `advisor#assigned → household`, `household#granted_view → document`. Every grant is a ledger entry (F1), so authorisation has a history rather than a current state.
**The hard part, and the decision to make early.** Whether the model is graph-shaped (OpenFGA) or rule-shaped (Cerbos). Migration after the fact is the single most expensive rewrite in this backlog — decide before Phase 3.
**Acceptance criteria.** A revoked grant denies within one request; the ledger shows who granted, when, under what scope; a household can see exactly which advisors hold access.
**Metric.** Enterprise security-review pass rate; time to onboard a new firm.

---

## F7 · Disclosure Watch — SEC primary-source monitoring per holding  ✅ SHIPPED

**Origin:** Fiduciary OS's "portfolio insights" ambition, pointed at a source that actually exists.
**Shipped in:** `src/features/disclosure-watch.ts` · endpoint `POST /api/v1/disclosure-watch` · tested live against AAPL
**Built:** ticker → CIK resolution from EDGAR's own map (an unknown ticker is reported, never guessed), recent filings of the material-change forms, plus one OR'd full-text query per issuer for risk language (about 5x cheaper than one query per phrase). Output links to the filings; it never summarises them. An unresolved ticker and a failed full-text query are both reported, so the digest says what it did not cover.
**Problem.** Advisory firms pay real money for "did any of my clients' holdings just disclose a material weakness / going-concern / cyber incident?" The prototype has no monitoring at all.
**Design.** The SEC client already exists (`src/sources/sec.ts`): `fullTextSearch` over EDGAR with form and date filters, joined to each household's holdings, deduplicated by accession number. Deliver as a daily digest with the filing link, never a summary paragraph — the value is *pointing*, not paraphrasing.
**Why it is cheap and defensible.** The data is free, the API is stable, the interpretation is the advisor's. It is a workflow feature, not an AI feature, which is exactly why it will ship.
**Failure modes.** EDGAR rate limits (10 req/s, descriptive UA required); false positives on boilerplate language; already-known annual boilerplate. Mitigate with a per-issuer suppression list and a "first seen" timestamp.
**Metric.** Weekly active advisors using the digest; renewal correlation.

---

## F8 · Eligibility attestations without disclosure ("prove it, don't show it")  ✅ SHIPPED (stage 1 and 2)

**Origin:** MASTERNEX *Sovereign Shield* zero-knowledge proofs, re-scoped to a real workflow.
**Shipped in:** `src/trust/attestations.ts` · 7 tests
**Built:** Ed25519 signed claims over a predicate and threshold (no value), mandatory expiry, a SHA-256 commitment with salt so the holder can selectively reveal later, and an explicit `nonDisclosure` list on every claim. Stage 3 (a true ZK proof) is deliberately **not** built — see the sequencing note below.
**Problem.** Households are asked to prove things — "accredited investor", "income above the Roth limit", "assets above the advisory minimum" — by handing over full statements. Advisors then hold data they do not need and must protect.
**Design.** A signed attestation over a committed value: the client proves `assets ≥ threshold` without revealing `assets`. Start with the simplest honest version: a server-issued, signed, expiring claim backed by a verified data source (F2 provenance), and add a true ZK proof only when a counterparty actually requires non-disclosure.
**Deliberate sequencing.** A signed claim solves 80% of the workflow at 5% of the effort. Reach for SNARKs when a counterparty refuses to trust your signature — do not start there.
**Metric.** Drop-off at "upload your statement" steps.

---

## F9 · Privacy-preserving advisor benchmarks  ✅ SHIPPED

**Origin:** MASTERNEX *PRINCE* federated learning + differential privacy.
**Shipped in:** `src/features/benchmarks.ts` · 7 tests
**Built:** a differentially private cross-firm mean — k-anonymity on firms (refused below the threshold, spending no budget), client-count exclusion, clipped contributions so sensitivity is *declared* rather than assumed, Laplace noise calibrated to ε, a seeded PRNG for reproducible audit, and a privacy budget that is spent per publication and refuses when exhausted. The mechanism is disclosed in provenance and the notes.
**Why not federated learning:** FL is the right tool when you need a per-client *model*. For an aggregate statistic it is more machinery, more attack surface, and harder to audit than a clipped mean plus calibrated noise. The honest limit is stated on the output: this protects against inference from the published statistic, not against colluding firms who already know each other's numbers.
**Problem.** "How does my firm's plan quality, cost and retention compare?" is a top-five reason an RIA buys a platform — and the platform cannot answer it by pooling client data.
**Design.** Compute benchmarks from per-firm aggregates with a minimum-participant threshold and calibrated noise; publish the mechanism and the ε budget, not just the number. Reference implementations: `apple/pfl-research`, `owkin/FLamby`.
**The honest caveat.** Federated learning is the wrong tool if you only need aggregate statistics — a secure aggregation protocol plus a threshold is simpler and easier to audit. Use FL only if per-client models are genuinely required.
**Metric.** Benchmark report open rate; NRR on Growth/Enterprise tiers.

---

## F10 · Document vault v2 — envelope encryption with a PQC migration path  ✅ SHIPPED

**Origin:** Fiduciary OS (vault is metadata-only today) + MASTERNEX PQC posture.
**Shipped in:** `src/security/vault.ts` · 8 tests
**Built:** per-document AES-256-GCM data key wrapped by a versioned KEK; rotation re-wraps 32 bytes per document without rewriting a single blob; restore path (`importSealed`) that **proves the wrapping key opens the data key before accepting the document**; listing returns metadata only; integrity sweep across every document.
**Problem.** The prototype stores document *metadata* and no files. A real vault needs encryption, key rotation, and a 30-year confidentiality horizon — which is long enough for "harvest now, decrypt later" to be a genuine risk.
**Design.** Per-document data key (AES-256-GCM), wrapped by a KMS key; envelope metadata in the database, ciphertext in object storage with SSE; rotation by re-wrapping data keys, never re-encrypting blobs. Crypto-agility: the KMS wrapping step is the only place to introduce a hybrid post-quantum KEM (`open-quantum-safe/oqs-provider`) later, without touching stored blobs.
**Acceptance criteria.** Key rotation without downtime; a deleted document leaves a ledger entry proving deletion; no plaintext ever leaves the service boundary.
**Metric.** Vault activation rate among Premium users; enterprise security questionnaire pass rate.

---

## F11 · Sandboxed partner calculators  ✅ SHIPPED

**Origin:** MASTERNEX *IronClaw* WASM sandbox (capability-based permissions, prompt-injection defence).
**Shipped in:** `src/features/formula.ts` · 9 tests · routes under `/api/v1/partners/formulas`
**Built:** partners submit a *formula* (a data structure), not code. A hand-written tokenizer and Pratt parser evaluate arithmetic over an allow-listed variable set with bounded tokens, depth and operations; the grammar has no property access, no strings, no assignment, and no host objects, so the escape techniques that defeat `node:vm` are not expressible. Unknown variables and unknown functions are rejected at **submission**, and every evaluation returns a trace.
**Why not WASM yet:** `node:vm` is not a security boundary and shipping it as one would be worse than shipping nothing. For genuinely arbitrary third-party code — a compiled model, a data transform — the correct boundary is a WASM instance or a credential-free process, and that is a deliberate later step, not a claim.
**Problem.** The moment the platform lets a third party (an IMO, a carrier, a fintech) contribute a calculator or model, that code runs inside a process that can read client data.
**Design.** Execute partner code in a WASM runtime with **no network, no filesystem, memory and instruction budgets**, receiving only the explicitly passed inputs and returning only a result. Capability grants are per-invocation and logged to the ledger. The same primitive hardens AI tool calls later.
**Why it matters commercially.** It is the precondition for an API/app marketplace (Phase 3 in the business plan) — you cannot sell a marketplace without a sandbox.
**Metric.** Number of live partner integrations; incidents attributed to partner code (target zero).

---

## F12 · Calculators as an MCP server — distribution, not a feature  ✅ SHIPPED

**Origin:** Fiduciary OS growth plan; confirmed by the scan (multiple retirement-planning MCP servers already live).
**Shipped in:** `src/mcp/server.ts` · `npm run mcp` · 7 tests · verified over real stdio
**Built:** five tools (tax, retirement, annuity, suitability, disclosure watch) over newline-delimited JSON-RPC with no SDK, so the wire format is auditable. Every result carries the same provenance envelope **and** the disclaimer, because a model may paraphrase the number but must not paraphrase away the receipt.
**Problem.** Top-of-funnel is expensive, and a calculator on your own domain only reaches people who already found you.
**Design.** Publish `annuity`, `life-insurance`, `retirement`, `tax` as MCP tools with the same provenance envelope and disclosures, each response linking back to the platform. The disclosure discipline is not optional: an assistant quoting a projection without the caveat is a regulatory exposure.
**Metric.** Referred sessions; cost per activated user vs paid channels.

---

# Rejected from the MASTERNEX document

Included because a scan that only says "yes" is not analysis.

| Idea | Why rejected |
|---|---|
| **Truth Credits / DTA tokenomics** (Polygon contracts, TC earned per verification, redeemable at $1) | A token redeemable for value, earned by contributing data, is a securities and AML question before it is a product. It also creates an incentive to fabricate contributions. Rejected for a fiduciary platform; the useful part (verifiable attribution) is delivered by F1's ledger without a token. |
| **Ghost Relay / Tor egress, GPS spoofing** | Anonymity is incompatible with KYC/AML and with a fiduciary's duty to know its client. This is not a policy preference; it is a conflict with the licence. |
| **Post-quantum cryptography everywhere, now** | Correct at the *key-wrapping* layer for long-horizon vault data (adopted in F10). Wrong as a blanket requirement: it adds latency and key-management complexity to protect data whose exposure window is two years. Scope it to the 30-year secrets. |
| **Neuromorphic hardware targets (Loihi, Innatera)** | No path to production on a SaaS timeline; the anomaly *behaviour* is worth having (F4) and does not need the silicon. |
| **AR field operations, drone/camera swarms, "magic moment" capture** | Belongs to a different product. Including it would be scope theatre. |

---

# Backlog summary

| ID | Feature | State | Effort | Moves |
|---|---|---|---|---|
| F1 | Evidence ledger | **Shipped** | S | Enterprise close rate |
| F2 | Provenance bus | **Shipped** | S | Trust, support load |
| F3 | Suitability gate | **Shipped** | S | Compliance pass rate |
| F4 | Action risk sentinel | **Shipped** | S | Duty-of-care, retention |
| F5 | Real-calibrated engines | **Shipped** | M | Calculator → registration |
| F6 | Authorisation graph | **Shipped** | M | Enterprise onboarding |
| F7 | Disclosure Watch | **Shipped** | S | Weekly active advisors |
| F8 | Eligibility attestations | **Shipped** (stages 1-2) | M | Funnel drop-off |
| F9 | Advisor benchmarks | **Shipped** | L | NRR |
| F10 | Document vault v2 | **Shipped** | M | Premium activation |
| F11 | Partner sandbox | **Shipped** (declarative) | L | Marketplace revenue |
| F12 | MCP distribution | **Shipped** | S | CAC |

**Sequencing logic:** F1-F5 were shipped first because they are cheap, they close trust gaps that block every enterprise deal, and they make every other feature cheaper to justify. F7, F6, F8, F10 and F12 have now shipped in that order. F9 and F11 shipped as mechanisms whose value is gated on real inputs: a benchmark needs five participating firms before it will publish at all, and the formula sandbox needs partners to write formulas. Both refuse rather than guess when those conditions are missing.
