# Fiduciary OS — decision workspace

A React/TypeScript/Vite interface for the proposed Fiduciary OS identity, navigation, plain-language content, and planning journey. This is a **pre-launch development build, not a production financial-planning system**.

## Run locally

Requires Node 22.22.2+ or 24.15+. CI uses the latest Node 22 LTS.

```bash
cd fiduciary-os/frontend
npm ci
npm run dev
```

Sample planning tools work without an account or API. To use **Next steps → Saved planning workspace**, also run the existing backend on port 3001 after applying migrations; see [the application guide](../README.md). Sign in using a development account created through the backend’s existing registration API. Do not use client data or production credentials.

Vite proxies `/api/v1` to `http://127.0.0.1:3001`. For a different API, set `VITE_API_BASE_URL` at build time and configure the backend CORS origin. Static production hosting must provide an API reverse proxy or an explicit API base; `npm run preview` is not the development proxy. No deployment is configured.

```bash
npm run type-check
npm test
npm run build
```

## Offline sample preview

After building, `npm run export-preview` writes `dist/fiduciary-os-preview.html`, a single-file sample preview with bundled assets. Saved planning workspace is disabled for `file:` previews; use the local app and API for persisted records. The export utility is carried forward from the alternate design branch, without merging its competing frontend.

## Implemented

- Six sections: Overview, My plan, Compare choices, Next steps, Documents, and Planning team.
- Responsive ink/ivory/teal identity, goal-led overview, clear example-data boundaries, progressive detail, and plain-language actions.
- Household/planning-team audience switch for previewing content only. **It is not access control.**
- Illustrative income comparison with transparent arithmetic, an accessible table, and validation. Its named, focusable horizontal scroll region has visible keyboard help: Left/Right scroll, Home/End reach either edge, and Tab leaves normally. The header stacks below 420 CSS pixels. Browser confirmation of these responsive fixes is tracked separately from jsdom keyboard-handler tests. No taxes, inflation, returns, sustainable-withdrawal analysis, or product recommendations.
- Sample board and saved workspace are deliberately separate. Sample cards are never imported automatically.
- Compare choices can create a new, unapproved sample discussion containing a fixed copy of that example's portfolio, annual spending, horizon and computed results. Later input edits do not change that record or carry its demo authorization into a new discussion. These snapshots stay in memory and are never saved to the API.
- Review-date changes append sample history without reopening completed actions, changing authorization, or scheduling reminders.
- Keyboard-operable sequential stages. Recording action-specific planning authorization and starting follow-through are separate operations. Completion requires evidence; review dates never erase completed history or schedule reminders.
- Saved workspace supports sign-in, empty states, action creation, loading/errors, reload, review notes, separate authorization/revocation, evidence, optional review dates, server-owned actor/time, and versioned history.
- Conflicting versions are rejected without silently retrying a mutation. Lost, unreadable, malformed-success and server-error write responses pause every save control and block form-handler resubmission until a successful reload. Failed reloads keep the guard and create draft; successful reconciliation clears that draft so it cannot be blindly submitted again. This client guard is not server-side request idempotency; inspect the fetched records before deliberately creating a new action.
- API sessions stay in memory, not localStorage/cookies; reload, leaving this workspace, expiry, or clearing the local session requires another sign-in.
- Status changes are announced in a live region. The saved action heading retains focus after operations. Focusing a sample board card reveals its full width with eight pixels for the focus outline, changing only the board’s horizontal scroll after native focus settles; obsolete focus callbacks do nothing. Modeled geometry tests cover Tab and Shift+Tab, while rendered fit is verified separately. No drag operation is required.
- Documents and Planning team have honest empty states; account linking, uploads, storage, and invitations are not simulated as completed capabilities.

## Server-enforced planning workflow

See [backend planning API](../backend/PLANNING_API.md) for request contracts. Every record is owned by the authenticated account, not by the free-text “Responsible for next step” field. Planning-team mode does not confer advisor permission. The API requires strict field validation, sequential stages, a review note before requesting approval, separate authorization bound to a record snapshot/version, and evidence before completion. Transactional compare-and-swap updates and unique event versions protect against stale writes.

Events are append-only **through the API**, not tamper-proof or independently attested. No trade, transfer, purchase, or legal instrument is authorized or executed. A user’s recorded review is not a qualified professional’s sign-off. No compliance certification, fiduciary credential, or WCAG conformance is claimed.

The existing backend does not revoke issued JWTs on logout. “Clear local session” removes this interface’s access token only; previously issued tokens remain valid until expiry. Server-side revocation, shorter-lived access, MFA, firm/household delegation, encryption/retention policies, and independent review are production gates.

## Verification and remaining work

Vitest/Testing Library covers sample tools and saved-workspace interactions using mocked HTTP responses. Backend Supertest tests use a real local SQLite database for ownership, authentication, strict validation, authorization/evidence gates, history, and conflicting writes. These are not browser end-to-end tests. Automated axe checks exclude contrast because jsdom cannot validate it; comprehensive browser, responsive visual, screen-reader, and contrast review remain unverified.

Future financial-scenario approvals must bind to immutable scenario/input versions and require fresh approval after substantive input changes. Current saved authorizations cover only the static planning context shown, not the separate sample comparison.

Before real users: verify source data and jurisdiction/year-versioned engines; implement advisor/household tenancy, secure document storage and invitations; define retention and evidence integrity; independently review authentication/security/privacy; run browser and assistive-technology acceptance tests; validate product positioning and disclosures with users and qualified professionals. Nothing has been merged or deployed as part of this work.

## Consolidation notes

The preserved reference implementation supplied useful sample-snapshot/review-date invariants and an offline export utility. They are adapted here rather than merging the competing frontend or coupling authorization to a status change. Its Escape/focus behavior applies to a collapsed mobile menu, which this implementation does not have: this interface keeps a native horizontally scrolling navigation row visible at phone width. Navigation changes focus the destination heading, tested for all six sections.

Full backend lint still fails on inherited findings; the repaired resolver and new blocking planning lint are described in [backend lint status](../backend/LINT_STATUS.md).


## Saved financial workspace (working branch)

The **Financial workspace** navigation entry now provides test-account registration/login, owner-scoped manual asset balances, monthly cash flow, versioned persistence, deterministic nominal/real balance charts, allocation and exact data tables. Existing sample cards stay separate; no data provider or bank is linked. Chart values update only after a confirmed save. Use synthetic inputs only.

The earlier dark/cyan Fiduciary visual system is independently adapted without discarding current workflow/accessibility fixes. See [source research, methods, limitations and production gates](../docs/RESEARCH_AND_PRODUCTION_GATES.md). It remains a pre-launch sandbox, not production financial advice or a certified platform.

## Circuit-board funnel preview (pages 1–2)

- `#/start` — free landing page: how the Symphony Composer works, a guided
  three-chip plan check (sample math, labeled as an example), the six planning
  stages, and a compliance placeholder for any comparative claim.
- `#/request` — guided advice request plus Free / Premium / Advisor-led plan
  cards. Prices read "Price to be set"; there is no checkout. Plan features
  that don't exist yet are tagged "Not built yet". A valid request is
  held in page memory only ("not sent yet"): no network call, no storage, no
  account. There is no advice-request endpoint on the backend yet.
- Default entry (decided by Marcus): on first load, no hash, a bare `#`, an
  in-page anchor (e.g. `#try`) or an unknown route sends visitors who aren't
  signed in to `#/start` and signed-in users to the workspace. `#/start`,
  `#/request`, `#/workspace` and `#/` are always honoured; in-page anchors
  after load never switch pages. Explicit sign-out ("Clear local session",
  "Sign out all sessions") returns to `#/start` and shows its notice once
  there; an expired session is cleared without redirecting.
- Sessions: both panels' tokens live in `src/session-signal.ts`, a module
  store above the router (memory only, no storage), read through
  `useSessionToken`. Leaving the workspace for `#/start` or `#/request` keeps
  the session; returning reloads the saved plan/actions. A reload still
  starts signed out. No new auth.
- Styles live in `src/funnel/funnel.css`, scoped under `.fos-funnel`, with
  the designer's official `--fos-*` tokens (`fos-circuit-sample/tokens.css`),
  scoped to `.fos-funnel` rather than `:root`. Funnel-only extensions:
  `--fos-focus-on-light` (the designer's `--fos-focus` is ~1.6:1 on light
  chip faces, below 3:1), `--fos-on-board-quiet`, `--fos-pin-chip-ink`,
  `--fos-example-line`, `--fos-error`, `--fos-meter-duration`.
  `npm run lint:styles` checks token contrast (text ≥ 4.5:1, focus ≥ 3:1),
  scoping and reduced motion.
- Out of scope: client/advisor portals, payments, MFA, advisor access rules.
