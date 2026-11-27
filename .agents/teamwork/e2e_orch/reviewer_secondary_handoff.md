# Secondary Reviewer Handoff — E2E Testing Track (`e2e_orch`)

- **Reviewer:** Secondary Reviewer (`teamwork_preview_reviewer`)
- **Scope:** Individual Tier Runners (`test:tier1`–`test:tier4`, `check`), Tiers 2, 3, and 4 specs, `lib/zip.mjs`, and `lib/fixtures.mjs`
- **VERDICT: REJECT**

---

## 1. Independent Command Verification

All commands were executed from `/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint`:

| Command | Exit Code | Specs | Pass | Fail | Total | Duration |
|---|---:|---:|---:|---:|---:|---:|
| `npm --prefix fiduciary-os/e2e run check` | `0` | 35/35 (`41 .mjs` files) | — | — | — | ~5 s |
| `npm --prefix fiduciary-os/e2e run test:tier1` | `1` | 18 | 4 | 32 | 36 | 8115 ms |
| `npm --prefix fiduciary-os/e2e run test:tier2` | `1` | 4 | 1 | 11 | 12 | 1836 ms |
| `npm --prefix fiduciary-os/e2e run test:tier3` | `1` | 7 | 0 | 7 | 7 | 2887 ms |
| `npm --prefix fiduciary-os/e2e run test:tier4` | `1` | 6 | 0 | 6 | 6 | 2681 ms |

- **Totals across Tiers 1–4:** 35 spec files, 61 leaf tests, 5 pass, 56 fail, 0 skipped, 0 harness errors.
- **Opaque-box check:** Zero `test.skip`, zero `test.todo`, and zero imports of internal backend/frontend/Prisma modules across `lib/`, `tests/tier2/`, `tests/tier3/`, and `tests/tier4/`.

---

## 2. Blocking Findings (Must Fix for Approval)

### Finding 1 — Pre-M3 False Pass on Unsourced Static Ratios (`tests/tier2/monte-carlo-boundaries.test.mjs:64-84`)
- **Observed behavior:** Running `node --test fiduciary-os/e2e/tests/tier2/monte-carlo-boundaries.test.mjs` produces `ok 2 - [F11] Rejects unsourced static marketing ratios (1.25x leverage / 11.10% FIA payout) without valid assumptionSource` (this is the sole passing test in Tier 2).
- **Root cause:** The existing pre-M3 `/api/v1/calculations/retirement-simulation` endpoint rejects `VALID_MONTE_CARLO_PAYLOAD` itself with HTTP `400` (`{"error":"Validation error: field: Invalid value, field: Invalid value, field: Invalid value"}`, as confirmed by subtest 1 at lines 30–38). Because subtest 2 (lines 64–84) only asserts `assertStatus(res, [400, 422], ...)` without checking the rejection reason in the response body (or verifying that a baseline valid request succeeds), it produces a **false pass** against an unimplemented M3 contract, violating `TEST_INFRA.md` §1 ("Strict No-Fake-Pass Rule").
- **Required fix:** Tighten `monte-carlo-boundaries.test.mjs:64-84` to assert that the `400`/`422` response body explicitly references the unsourced-assumption/static-ratio rule (e.g., `/assumptionSource|unsourced|static|leverage|fia/i`) — or first verify that the same request with a valid `assumptionSource` and without unsourced ratios returns `200`.

### Finding 2 — Generic HTTP `413` Can Bypass Temporal >2 MB S3 Offload Verification (`tests/tier2/orchestration-and-connectors-boundaries.test.mjs:7-36`)
- **Observed behavior:** Currently returns HTTP `500` on the unimplemented endpoint (so it fails today), **but** line 24 accepts `[200, 201, 202, 413]` and lines 28–35 only assert `data.payloadRef || data.s3Ref || data.offloaded === true` inside `if (res.ok)`.
- **Root cause:** If Express's body-parser middleware is configured to return a generic `413 Payload Too Large` before routing to `/api/v1/orchestration/workflows`, this test will pass without ever exercising Temporal's >2 MB S3 UUID reference offload contract.
- **Required fix:** Either require `[200, 201, 202]` with a compact `payloadRef`/`s3Ref` UUID (matching `PROJECT.md` line 14: *"payloads >2 MB stored in S3 with compact UUID refs"*), or if `413` is explicitly allowed as an offload-redirect contract, assert that the `413` JSON body contains an explicit offload directive / pre-signed upload contract field (not a generic body-parser error).

---

## 3. Non-Blocking Observations

- **`tests/tier4/scenario-04-real-property-committee.test.mjs:8-37`:** The test title states *"verifies 30-yr amortization + 2^3 DOE + Committee Memo consistency"*, but the loop only asserts the 8-row DOE matrix and Committee Memo markdown (not `amortizationSchedule`/`amortization` length 30 or 360). While `tier2/crm-and-property-boundaries.test.mjs:93-97` checks 30-yr amortization on the `$100M` boundary, adding the amortization assertion inside Scenario 04 will make the test match its title.

---

## 4. Verified Passing Checklist Items

- **Tier 2 Boundary Coverage (`tests/tier2/`):** All required boundary vectors are present across the 4 specs: empty JSON `{}`, >10 KB string, invalid role enum, zero/negative/extreme `$100M` property underwriting, Monte Carlo `0`/`-1`/`1`/`10000`/`10001`/string paths, unsourced `1.25x`/`11.10%` ratios, 7 PII redaction variants + prompt injection, 6 banned-phrase case/punctuation/whitespace variants, Temporal >2 MB guard, Plaid Free-tier 1-connection cap, Compulife missing/invalid `REMOTE_IP`, and invalid consent enums.
- **Tier 3 Pairwise Coverage (`tests/tier3/`):** All 7 required cross-feature pairwise specs (`01` through `07`) are implemented with genuine multi-subsystem assertions and zero stubs.
- **Tier 4 Real-World Scenarios (`tests/tier4/`):** All 6 scenarios (`scenario-01` through `scenario-06`) execute genuine multi-step end-to-end flows spanning frontend contracts, backend APIs, compliance gates, consent enforcement, privacy export/soft-delete, and RO-Crate 1.1 ZIP validation.
- **`lib/zip.mjs`:** Genuine zero-dependency PKZIP Central Directory + Local File Header + `zlib.inflateRawSync` parser with real SHA-256 digesting and strict RO-Crate 1.1 JSON-LD validation (`ro-crate-metadata.json`, `@context` referencing `ro/crate/1.1`, `@graph` containing both `ro-crate-metadata.json` and `./`). No cheating or shortcuts.
- **`lib/fixtures.mjs`:** Accurately reflects `ORIGINAL_REQUEST.md` and `PROJECT.md` (10-row lexicon, 6 banned phrases + variants, 4 legacy phrases, Albers/Itten palette, 220ms transition tokens, 5 lifecycle stages, 6 signature charts, 3-gen household, `hold`/`brrrr`/`str` underwriting, 10k-path MC, and reconciled unit economics targets).
