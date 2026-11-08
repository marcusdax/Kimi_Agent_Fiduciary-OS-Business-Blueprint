# Fiduciary OS — decision workspace preview

The first React/TypeScript frontend in this repository. It implements the proposed Fiduciary OS identity and a complete **illustrative, in-memory planning workflow**, not a production financial service.

## Run

Requires Node.js 24+ and npm. No API keys, database, or backend process needed.

```sh
cd fiduciary-os/frontend
npm ci
npm run dev              # localhost:5173
npm run type-check
npm test
npm run build
npm run preview          # serve the production build locally
# Or open dist/fiduciary-os-preview.html directly for the offline sample preview.
```

## Included

- Responsive Overview, My plan, Compare choices, Next steps, Documents, and Planning team views.
- Three life-goal entry points with plain-language copy and a shared visual system.
- A sample retirement-income comparison recalculated from visible portfolio, spending, and income assumptions. Formula: max(0, spending − income) × 12 ÷ portfolio. No simulated returns, success probability, taxes, inflation, or insurer guarantees.
- A keyboard-operable action board. A team prepares evidence and alternatives, records a review, the household explicitly approves that specific sample action, and the team records completion evidence. Forward transitions cannot skip stages.
- A snapshot of the assumptions attached to each income discussion. Changing comparison inputs creates a new unreviewed discussion, not a silent change to an approved record.
- Completed records stay completed. New circumstances create a linked review with no inherited approval. “Revisit” is a flag, not a workflow lane that erases completion. Optional review dates do not change status, inherit consent, or schedule notifications.
- Per-action sources, assumptions, costs and unknown conflicts remain visible; unknown values are not represented as confirmed advice.
- Screen-reader announcements, focus preservation, skip navigation, visible focus indicators, non-drag controls, reduced-motion styles, semantic comparison tables, and mobile navigation.

## Deliberate boundaries

All sample data is labeled illustrative. **Do not enter real personal or financial information.** Changes exist only in React memory; reload or Reset preview discards them. There is no localStorage, telemetry, network data fetching, account connection, file upload, professional assignment, legal document generation, or trade/insurance execution.

The audience selector rehearses UI states; **it is not authentication, authorization, tenancy, or evidence of a real professional review**. Workflow checks are client-side demonstration rules only and can be bypassed by changing the JavaScript. No real consent or audit record is created. Documents is a checklist, not a secure vault. Planning-team roles are explanatory, not actual assigned professionals. The product name does not establish a fiduciary credential.

The existing Express backend is intentionally unchanged. Its tax prototype uses 2024 federal rules, insurance quotes are illustrative, and Documents supports metadata rather than uploaded files; estate and risk modules remain planned. These limits are visible in the preview information panel. Its calculator endpoints require authentication and use simplified assumptions; adding a second login/token system or exposing their heuristic success figures would enlarge scope and undermine the proposed trust language. Production integration must use server-enforced household/advisor permissions, durable versioned decisions and approvals, existing backend provenance/disclosures, and an appropriately reviewed financial rules engine.

## Acceptance checks

`npm test` covers arithmetic boundaries, invalid inputs, transition gates, explicit consent, immutable snapshots, completion preservation, navigation, reset, and keyboard-only review/approval/completion with status announcements and retained focus. Axe checks run across four destinations in jsdom; color contrast and browser layout require separate verification. These tests are not a WCAG conformance certification.

Manual checks: desktop and 360px-wide navigation; every screen; keyboard-only action details and stage updates; missing rationale; wrong-audience rejection; approval without consent; new discussion after changed inputs; linked review after completion; browser reload clearing all changes. See the pull request for actual checks completed and outstanding visual evidence.

## Production follow-up (not implemented)

1. Connect real identity and server-side household/advisor permissions; do not promote the demo audience switch into an access-control mechanism.
2. Persist decisions, exact input versions, reviewed alternatives, approval scopes, and completion evidence on the server with concurrency and audit controls.
3. Integrate existing API routes while preserving their provenance and limiting financial calculations to validated capabilities.
4. Add authorized document storage, real collaboration and notification delivery only after their security and professional-review requirements are met.
5. Complete human assistive-technology testing, responsive browser tests, contrast verification, security review, and deployment configuration before launch.
