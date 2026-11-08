# Financial workspace: evidence, methods, and release gates

Research checked November 8, 2026 (CST). Bounded primary-source review, **not** an exhaustive scrape of GitHub or journals. No paywall bypass, external data ingestion, bank connection, copied financial dataset, or paid API. No claim of production readiness or regulated-adviser qualification.

## Visual provenance

The chosen earlier Fiduciary OS visual reference is the owner's Wealth Symphony v6 stylesheet:
https://github.com/marcusdax/wealth-symphony-nexus/blob/main/public/css/styles.css
It defines near-black `#050508`, panels `#15151e`, cyan `#00f0ff`, gold `#ffd700`, grid texture, monospace accents, and a compact dark sidebar. This change independently adapts that token language to the **Business Blueprint** application, retaining its current navigation, keyboard fixes, saved planning workflow, and honest capability boundaries; it does not merge another app.

Evidence caveat: accessible conversation memory confirms Fiduciary OS-only scope but does not identify a particular earlier screenshot. The alternate Blueprint branch `feat/fiduciary-os-decision-workspace` is another, *light evergreen* design, not the dark reference. The dark reference is real source evidence, not proof that a particular screenshot was approved. Visual acceptance remains the owner's review.

## Sources reviewed and adoption decisions

| Primary source | Verified reuse / maintenance | Decision |
|---|---|---|
| https://github.com/recharts/recharts / https://github.com/recharts/recharts/blob/main/LICENSE | MIT, retain notices; not archived, activity Nov 7 2026 CST | Suitable when richer plots justify dependency. This slice uses original semantic SVG + exact tables instead of adding a large chart dependency. |
| https://github.com/formulajs/formulajs / https://github.com/formulajs/formulajs/blob/master/LICENSE | LICENSE text MIT including bundled notices; GitHub SPDX metadata is NOASSERTION, so preserve actual notices. Not archived, activity Oct 1 2026 | Potential independent spreadsheet reconciliation for PV/FV/PMT. Not added; current recurrence is small, original, and explicitly tested. A license is not numerical or financial certification. |
| https://github.com/PSLmodels/Tax-Calculator / https://github.com/PSLmodels/Tax-Calculator/blob/master/LICENSE | Actual LICENSE grants CC0 worldwide; not archived, activity Nov 7 2026 CST. Check third-party input dataset rights separately. | Later tax-year-specific federal scenarios in a separately validated Python module/service. Do not pretend the current fixed-2024 heuristic is complete tax advice. |
| https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator | SEC original institutional source: principal, contributions, horizon, estimated rate and compounding frequency | Inform transparent deterministic growth inputs, not promised returns; no page/code copied. |
| https://www.bls.gov/cpi/factsheets/purchasing-power-constant-dollars.htm | Original BLS explanation: convert nominal to real dollars by base/current price-index ratio | Real-dollar scenario divides nominal balance by cumulative **user-assumed** inflation factor. No CPI observations fetched, and no CPI-linked claim. |
| https://otexts.com/fpp3/prediction-intervals.html | Hyndman/Athanasopoulos academic forecasting text, §§5.5, 5.8–5.10: uncertainty, held-out errors, rolling origin | Research reference only; no text, figures, R code or datasets copied. Freely readable does not establish commercial republication rights. Any future probabilistic model needs calibration and out-of-sample validation before a confidence label. |
| https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html | Original Dartmouth research-return documentation; historical data reconstructed monthly; 2025 FIZ→CIZ methodology change | Future factor-analysis research only. No permissive commercial redistribution license established; **do not bundle or serve** these files without resolving rights. Missing -99.99/-999 values are not returns. |

No research source above has been embedded wholesale or presented as a third-party endorsement. AGPL engines and proprietary market datasets are intentionally not copied into this application.

## Working first vertical slice

**Financial workspace** is independent from in-memory sample cards. A test account can register/sign in, enter four manual asset categories plus source/as-of date, monthly income/spending, return/fee/inflation assumptions and horizon, save to its owner-scoped database record, reload later, and view allocation and yearly nominal/real balance charts with exact tables.

- USD money stored in plan input as integer cents, rates as integer basis points. No floating-point price claims or fetched quotes.
- One plan per account. Strict schema rejects unknown fields, invalid calendar dates, negative/non-finite values and unsupported ranges.
- `PUT /api/v1/financial-plan` requires expected version (0 for first save); transactional compare-and-swap prevents lost updates. `GET` derives only the authenticated user's record.
- No automatic retry after uncertain write / stale version. Reload clears the draft and reconciles the saved version before editing again.
- Charts only change after confirmed save, with source/as-of/version shown. They do not import sample data automatically.
- Financial projections are **conditional scenarios**, not forecasts or probabilities.

## Reproducible calculation contract: monthly-cashflow-v1

Initial balance is the sum of four entered category balances. For each month:

1. Grow balance by `(1 + annualReturnBps/10000)^(1/12)`.
2. Charge asset fee using monthly factor `(1 - annualFeeBps/10000)^(1/12)` on the grown balance.
3. Add constant nominal monthly income; subtract constant nominal spending at month end.
4. Floor assets at zero and accumulate any unfunded spending separately. Track first month with a shortfall; do not imply a strategy can fund it.
5. At year end, real balance is nominal divided by `(1 + annualInflationBps/10000)^year`. Inflation affects displayed purchasing power only; income/spending are not silently escalated.

No taxes, trades, dividends separated from assumed total return, benefit eligibility, market forecasts, correlated shocks, stochastic inference, or sequence-of-returns simulation. No daily performance history invented from a single snapshot. Monetary calculations retain fractional cents internally and round response rows to cents; UI summaries round to dollars.

Acceptance checks: zero rates reconcile exactly; known 10% compound growth; 1% fee reconciliation; inflation neutralizes equal nominal return in the no-flow case; depletion/unfunded spending; invalid inputs; unauthenticated/refresh-token refusal; cross-account privacy; stale-version 409 without overwrite; reload persistence; ambiguous UI write guard; table/chart accessibility and responsive manual review.

## Security changes and remaining production gates

Implemented here: fix existing cross-owner holding deletion, transactional bulk holding replacement with nested validation; short-lived default access JWT (15 minutes); refresh checks current user/role; suppress client stack/database details; no email PII in auth success logs; bounded bcrypt input; auth-specific rate limiter; 1 MB body limit; explicit trusted proxy hop for Railway; explicit optional Redis disable; strong JWT required in production; compatible parser patches plus tested Zod 4 upgrade resolving high advisory.

Still **not production ready**:

1. No server-side token revocation/refresh rotation, email verification, password reset, MFA or firm/household delegated authorization. “Clear local session” does not revoke an already issued token. Role-preview selector is not access control.
2. A single SQLite volume is appropriate only for this isolated sandbox. Before customer data: production database decision, encrypted storage and backups, restore drill, retention/deletion policy, least-privilege operator access and migration rollback/forward recovery evidence.
3. Historical calculators still include assumed annuity rates, fixed-2024 tax brackets and heuristic retirement “successProbability.” Never render that as a scientifically validated forecast. New financial workspace does not call those endpoints.
4. Missing AI/data keys must fail closed in production (503), not impersonate live data. The sandbox uses production runtime mode with Redis explicitly off; example UI remains labeled sample.
5. Dependency runtime audit and full dev-tool audit have different scopes; record actual results in the PR. Full inherited lint debt remains; successful tests/build do not establish security certification.
6. Browser/device/keyboard/screen-reader and WCAG contrast acceptance, load/abuse testing, SAST/dependency policy, operational SLOs, incident process, privacy/legal and financial-method review still required.
7. Secure document storage, account aggregation, advisor sharing, execution, bank credentials and financial transactions remain out of scope.

Next coherent slices: (a) revocable sessions plus invitation-based access, (b) dated balance snapshots and authenticated cash-flow ledger with genuine history, (c) licensed economic-series adapter with provenance/cache/staleness, then (d) calibrated backtests/uncertainty with versioned dataset rights. Do not substitute research breadth or decorative graphs for those controls.
