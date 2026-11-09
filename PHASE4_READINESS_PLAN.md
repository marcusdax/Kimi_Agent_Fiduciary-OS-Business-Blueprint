# Phase 4 readiness plan: scale and attest

Companion to `VALUE_FLOW_AND_REPO_ROADMAP.md`. What this sprint shipped, and what the rest needs. Nothing here is an attestation.

## Shipped (branch `feat/roadmap-phase4-scale-sprint`)
- **Published API reference:** `/docs` (Scalar, self-hosted script, own CSP) and `/docs/openapi.json`, generated from zod schemas. A drift test fails CI if a firms or calculations route is added without a documented path.
- **OpenTelemetry tracing:** off unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set. HTTP spans use route templates only; `ai.deliver` spans carry endpoint, provider and source, never text. Auto-instrumentation packages were skipped because their peer ranges conflict with the current SDK; revisit when they align.

## Not shipped, with the real work involved
| Item | Why not yet | What it takes |
|---|---|---|
| PostgreSQL in production | Needs a database to test against and a decision on hosting | Change the Prisma provider, regenerate the baseline migration (existing migrations are SQLite SQL), replace SQLite-specific behavior (`node:sqlite` is in the other repo line, not this backend), run the full jest suite against Postgres in CI, rehearse a data move. Fix `DATABASE_URL` handling in the CI backup drill. |
| BullMQ job queue | Redis is configured but no job needs it yet; scaffolding without a consumer would be dead code | First real jobs: scheduled plan/portfolio refresh once Plaid exists; email sends once react-email templates exist; batch AI insights. Each needs idempotency keys and a dead-letter policy. |
| PolicyEngine, OpenBB | AGPL-3.0 | Run as separate services behind an HTTP boundary; never import into this codebase. Needs a use case first (tax-benefit simulation, market data). |
| Documenso (e-signature), Comp AI (SOC 2 tooling) | AGPL-3.0, needs infrastructure and accounts | Separate services; Documenso needs an engagement-letter template and counsel review. |
| SOC 2 Type I audit | A process and an auditor, not code | See below. |

## SOC 2 Type I readiness map (what exists vs. gaps)
| Area | Exists in the repo | Gap |
|---|---|---|
| Access control | Role + relationship-based household access, access log with reasons, session replay protection | Access reviews, offboarding procedure, MFA for staff |
| Logging and monitoring | Request logger (redacted), AI interaction log, access log, optional tracing | Alerting, log retention policy, on-call |
| Change management | CI with type-check, tests, lint, audit, SBOM, docker build | Required reviews and protected branches (GitHub settings), release approval record |
| Data protection | Field privacy tests, no secrets in repo, backup/restore drill | Encryption-at-rest decision for production DB, key management, data classification |
| Vendor management | None | Vendor list and reviews (hosting, email, AI provider, analytics) |
| Policies | README trust section | Written security, incident-response, and acceptable-use policies |
| Auditor | None | Select an auditor and a compliance tool; choose observation window |

Next actions are decisions for the owner: hosting and database choice, whether to buy a compliance tool, and which auditor. Engineering can then execute the Postgres move and queue work against real requirements.
