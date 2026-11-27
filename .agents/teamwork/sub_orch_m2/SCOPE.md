# Milestone M2 Exclusive File Ownership (`SCOPE.md`)

## Owned Paths (Read & Write)
- `fiduciary-os/frontend/**`
- `fiduciary-os/backend/src/index.ts` (mount `/api/v1/compliance` only)
- `fiduciary-os/backend/src/services/aiGuardrails.ts`
- `fiduciary-os/backend/src/services/complianceGates.ts`
- `fiduciary-os/backend/src/routes/compliance.ts`
- `fiduciary-os/backend/tests/unit/compliance-gates.test.ts`

## Strictly Out-of-Scope (DO NOT MODIFY)
- `fiduciary-os/backend/src/orchestration/**` (M4)
- `fiduciary-os/backend/src/connectors/**` (M4)
- `fiduciary-os/backend/src/services/dualLoopVerification.ts` (M4)
- `fiduciary-os/backend/src/services/provenanceService.ts` (M4)
- `fiduciary-os/backend/src/services/skillGovernance.ts` (M4)
- `fiduciary-os/backend/src/services/honeybeeGovernance.ts` (M4)
- `fiduciary-os/e2e/**` (E2E Track — read-only interface reference only)
- `fiduciary-os/backend/prisma/**` (M1 — already applied)
