# Milestone M0 Scope & Ownership

## Owned Files
- `scripts/env-setup.sh`
- `fiduciary-os/backend/docker/init-pgvector.sql`
- `trust-core/package.json`
- `fiduciary-os/backend/.env.test` (if needed)

## Safety Constraints
- NEVER wipe or run destructive tests against the live dev database `fiduciary_os`.
- All backend Jest tests MUST target the isolated `fiduciary_os_test` database.
- NEVER weaken test assertions or hardcode test results.
- Keep `scripts/env-setup.sh` strictly idempotent (safe to re-run multiple times).
