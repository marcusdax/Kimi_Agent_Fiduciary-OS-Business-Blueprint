# Sprint log: roadmap Phases 1-2

Branch `feat/roadmap-phase1-2-sprint`. Educational and illustrative only; not advice.

## Done
- **Engines (Phase 1 sec. 2):** `backend/src/engines/` - formulajs time-value wrappers (MIT), SSA 2023 period-life-table mortality, actuarial annuity pricing, historical-cycle retirement replay (cFIREsim-style method, own implementation), versioned 2024/2026 tax tables. The four `/calculations/*` routes now use them.
- **Honesty changes:** retirement returns `historicalSuccessRatePct` (the old `successProbability` is gone); life-insurance premium and lifetime cost are `null` because no licensed carrier-rate source exists; annuity `productType` is accepted but the math is product-neutral.
- **Funnel analytics (Phase 1):** `frontend/src/analytics.ts` - consent-gated, allowlisted props, local buffer, optional PostHog sink. **Library only: not yet wired into the UI** (needs a consent banner and call sites).
- **Tracing (Phase 2):** `backend/src/services/traceSink.ts` - optional Langfuse REST sink, env-gated, metadata-only unless `LANGFUSE_INCLUDE_CONTENT=true`, never blocks AI responses.
- **MCP server (Phase 2):** `backend/src/mcp/server.ts`, `npm run mcp`.
- **Evals/CI:** the existing CI already runs the full jest suite, which includes the deterministic guardrail tests; live promptfoo evals remain on demand (they need an API key). No new CI step was needed.

## Tests
Backend 107 passing (was 86); frontend 68 passing (was 64); `tsc --noEmit` clean; `npm audit --omit=dev` found 0 vulnerabilities.

## Open items / caveats
- `historical-returns.json` was copied from the sandbox's table and has not been re-verified against Damodaran.
- Annuity discount rate (4.5%) is a placeholder default; mortality is population data, not annuitant data.
- 2026 tax tables verified for brackets and standard deductions only; HSA and other limits are not verified.
- No change to the frontend calculator UI; nothing calls `/calculations/*` yet.
- Backend was run in a cloud container, not on the owner's machine.

## Deferred
- shadcn/Tremor/Recharts UI-kit swap (Phase 1 sec. 1), Phases 3 and 4.
