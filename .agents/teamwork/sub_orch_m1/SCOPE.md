# Milestone M1 Scope & Exclusive File Ownership

## Exclusive File Ownership
- `fiduciary-os/backend/prisma/**`
- `fiduciary-os/backend/src/index.ts`
- `fiduciary-os/backend/src/routes/{crm,consent,privacy,trust,intelligence}.ts`
- `fiduciary-os/backend/src/services/{masternexService,crmService,shapleyService,consentService,kdenseService}.ts`
- `fiduciary-os/backend/tests/**`
- `fiduciary-os/docker-compose*.yml`
- `trust-core/src/**` (ledger durability if needed) & `trust-core/tests/**`

## Out of Scope
- `fiduciary-os/frontend/**` (owned by M2/M3)
- Root financial model docs (owned by M5)
- `fiduciary-os/e2e/**` (owned by E2E track)
- Note on `scripts/env-setup.sh`: Check during Explore whether `privacy_and_audit.sql` should be applied via a dedicated backend SQL runner/script or if `scripts/env-setup.sh` needs a hook (only touch owned paths unless strictly necessary and coordinated).
