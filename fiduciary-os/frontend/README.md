# Fiduciary OS — decision workspace

An interactive React/TypeScript/Vite frontend implementing the proposed Fiduciary OS identity, navigation, plain-language content, and planning journey. This is the first frontend in this repository, **not a production financial-planning system**.

## Run locally

Requires Node 22.22.2+ or 24.15+ (CI uses the latest Node 22 LTS).

```bash
cd fiduciary-os/frontend
npm ci
npm run dev
```

Open the Vite address printed in the terminal. No API key, database, or login is needed.

```bash
npm run type-check
npm test
npm run build
npm run preview
```

## Implemented

- Six navigable sections: Overview, My plan, Compare choices, Next steps, Documents, and Planning team.
- Responsive ink/ivory/teal identity, goal-led overview, visible sample-data boundary, progressive detail, and clear action language.
- Household/planning-team view switcher for previewing content. **It is not authentication, tenancy, or authorization.**
- Editable illustrative income comparison, transparent arithmetic, accessible table, and input validation. No stochastic projections, tax rules, Social Security, investment returns, or product recommendations are implemented.
- Keyboard-operable action review and sequential status transitions; explicit demo authorization before In progress; evidence required for Verified complete. Status changes announced in a polite live region; focus remains on the transition control, or returns to the action heading on completion.
- Optional review date, separate from completed status. No reminders are scheduled. Prior history remains visible.
- Source, assumptions, alternatives, costs/conflicts, ownership, and decision-history fields on sample records.
- Explicit empty states instead of pretend document upload, account linking, or invitations.
- Vitest/Testing Library domain/UI tests, axe checks on key views, and an independent frontend GitHub Actions workflow.

## Data and security boundary

**All records are examples.** State lives only in React memory and resets on reload; no localStorage, cookies, telemetry, external requests, or real financial action is involved. Do not enter private information. The app does not call the existing backend. Demo authorization and completion records are neither legal consent nor a durable audit trail. They cannot authorize transactions. No security certification, fiduciary status, or full WCAG conformance is claimed.

The browser state machine demonstrates intended UI behavior only. A production service must enforce transitions, evidence, version checks, and consent on the server with authenticated identity and appropriate household/advisor/firm permissions. UI checks alone are not security controls.

## Before real users

1. Implement authenticated, household-scoped goal, scenario, action, and immutable decision-history APIs; enforce explicit per-action authorization server-side, concurrency controls, timestamps/actors, retention, and evidence integrity.
2. Connect confirmed source data with source dates and consent; integrate reviewed, jurisdiction/year-versioned planning engines instead of the example arithmetic.
3. Implement secure document storage, access controls, professional invitations, and separate role-appropriate views. Never treat the preview audience selector as an access boundary.
4. Add persistence, loading/error states, multi-user integration tests, browser end-to-end tests, manual assistive-technology testing, and a complete accessibility/security review.
5. Validate positioning, legal disclosures, product relationships, fees, and business model with actual users and appropriate professionals. Set measured baseline metrics before promising improvements.

No existing backend routes, data models, or migrations are modified by this frontend increment. No deployment is configured. Existing backend tests remain regression checks, not proof of production readiness.
