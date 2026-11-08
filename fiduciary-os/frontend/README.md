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
- Illustrative income comparison with transparent arithmetic, an accessible table, and validation. No taxes, inflation, returns, sustainable-withdrawal analysis, or product recommendations.
- Sample board and saved workspace are deliberately separate. Sample cards are never imported automatically.
- Keyboard-operable sequential stages. Recording action-specific planning authorization and starting follow-through are separate operations. Completion requires evidence; review dates never erase completed history or schedule reminders.
- Saved workspace supports sign-in, empty states, action creation, loading/errors, reload, review notes, separate authorization/revocation, evidence, optional review dates, server-owned actor/time, and versioned history.
- Conflicting versions are rejected without silently retrying a mutation. Reload before making another decision. API sessions stay in memory, not localStorage/cookies; reload, leaving this workspace, expiry, or clearing the local session requires another sign-in.
- Status changes are announced in a live region. The saved action heading retains focus after operations. No drag operation is required.
- Documents and Planning team have honest empty states; account linking, uploads, storage, and invitations are not simulated as completed capabilities.

## Server-enforced planning workflow

See [backend planning API](../backend/PLANNING_API.md) for request contracts. Every record is owned by the authenticated account, not by the free-text “Responsible for next step” field. Planning-team mode does not confer advisor permission. The API requires strict field validation, sequential stages, a review note before requesting approval, separate authorization bound to a record snapshot/version, and evidence before completion. Transactional compare-and-swap updates and unique event versions protect against stale writes.

Events are append-only **through the API**, not tamper-proof or independently attested. No trade, transfer, purchase, or legal instrument is authorized or executed. A user’s recorded review is not a qualified professional’s sign-off. No compliance certification, fiduciary credential, or WCAG conformance is claimed.

The existing backend does not revoke issued JWTs on logout. “Clear local session” removes this interface’s access token only; previously issued tokens remain valid until expiry. Server-side revocation, shorter-lived access, MFA, firm/household delegation, encryption/retention policies, and independent review are production gates.

## Verification and remaining work

Vitest/Testing Library covers sample tools and saved-workspace interactions using mocked HTTP responses. Backend Supertest tests use a real local SQLite database for ownership, authentication, strict validation, authorization/evidence gates, history, and conflicting writes. These are not browser end-to-end tests. Automated axe checks exclude contrast because jsdom cannot validate it; comprehensive browser, responsive visual, screen-reader, and contrast review remain unverified.

Future financial-scenario approvals must bind to immutable scenario/input versions and require fresh approval after substantive input changes. Current saved authorizations cover only the static planning context shown, not the separate sample comparison.

Before real users: verify source data and jurisdiction/year-versioned engines; implement advisor/household tenancy, secure document storage and invitations; define retention and evidence integrity; independently review authentication/security/privacy; run browser and assistive-technology acceptance tests; validate product positioning and disclosures with users and qualified professionals. Nothing has been merged or deployed as part of this work.
