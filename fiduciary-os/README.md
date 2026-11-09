# Fiduciary OS — Application

The code for Fiduciary OS: a planning platform with free tools for households and a white-label workspace for financial advisors. For the business plan, value flow, and go-to-market gates, start at the [repository README](../README.md).

> [!NOTE]
> The **backend API prototype** and a new **interactive frontend preview** are implemented. The frontend has sample tools in memory plus an authenticated saved planning-action workspace using the backend. Financial execution, real account linking, and advisor delegation remain out of scope. Docker images, Kubernetes manifests, and Terraform remain unimplemented.

---

## Modules

| Module | Backend support today | Frontend |
|---|---|---|
| Annuity Navigator | `POST /calculations/annuity` — actuarial fair-value illustration (SSA 2023 mortality, discount rate is an input; not a carrier quote) | Planned |
| Life Insurance Navigator | `POST /calculations/life-insurance` — income-replacement present-value gap with the 10x rule shown for comparison; premium is `null` (no licensed quote source); `POST /market/insurance/quotes` — **illustrative figures only**, anonymised carriers | Planned |
| Retirement Income Navigator | `POST /calculations/retirement` — historical-cycle replay (1928+); reports a historical success rate, not a probability | Planned |
| Tax Planning | `POST /calculations/tax` — federal brackets and standard deductions, `taxYear` 2026 (default, Rev. Proc. 2025-32) or 2024 | Planned |
| Investment X-Ray | `GET/POST /market/portfolio-analytics` | Planned |
| Digital Assets | `/crypto/*` via CoinGecko | Planned |
| Symphony Composer | `POST /ai/symphony-playbook`, `POST /ai-v2/symphony-playbook` | Planned |
| The Vault | `/documents` — metadata only, no file storage yet | Planned |
| Risk Analytics, Estate Engine | Not started | Planned |

---

## Tech stack

| Layer | In the repo | Target (see architecture docs) |
|---|---|---|
| API | Node.js 20, Express, TypeScript | same |
| Data | Prisma + SQLite | PostgreSQL 15, TimescaleDB, Redis |
| Auth | bcrypt + JWT access/refresh tokens | Firm/advisor/household tenancy, MFA, SSO |
| Realtime | Socket.io | same |
| AI | Anthropic and Moonshot Kimi behind `services/aiGateway.ts`: guardrails, disclosures, PII stripping, `ai_interactions` log, CI tests + promptfoo evals | Human review workflow on top of the log |
| Frontend | React + TypeScript + Vite; responsive sample tools and saved owner-scoped action workflow | Household/firm delegation, verified sources, retention and evidence integrity |
| CI | GitHub Actions: type-check, test, build ([workflow](../.github/workflows/backend-ci.yml)) | + frontend, images, deploy |

---

## Frontend preview

```bash
cd frontend
npm ci                     # Node 22.22.2+
npm run dev
```

Read [frontend/README.md](frontend/README.md) for tests, implemented flows, and limitations. Sample actions and demo permissions reset on reload. Under Next steps, Saved planning workspace persists records through the API after development-account sign-in. Session tokens remain in memory only; financial accounts, secure document storage, and advisor sharing are not implemented.

## Backend quick start

```bash
cd backend
cp .env.example .env        # set JWT_SECRET
npm ci
npx prisma migrate deploy
npm run dev                 # http://localhost:3001  ·  health: /health
```

Tests:

```bash
DATABASE_URL=file:./test.db npx prisma migrate deploy
DATABASE_URL=file:./test.db JWT_SECRET=test npx jest --runInBand
```

Frontend `dev-frontend`, `test-frontend`, `type-check`, and `build-frontend` Makefile targets now work. Docker/infra, lint, format, and browser-e2e targets still need updates; no deployment is configured.

---

## Security posture

Implemented: bcrypt password hashing, separate access and refresh tokens, Helmet headers, CORS allow-list, rate limiting, per-user scoping on every data route, validated-field-only writes on profile updates, PII stripped before AI calls, an AI prompt/response supervision log, and placeholder data refused when `NODE_ENV=production`.

**Not** implemented or attested: SOC 2, WCAG conformance testing, encryption of stored documents, MFA, general audit logging (beyond AI and planning-event history), server-side JWT revocation, penetration testing. The [Security Architecture](../Security_Architecture.md) document describes the target controls.

Report security issues privately to the repository owner rather than in a public issue.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Linting currently reports pre-existing findings and is non-blocking in CI; type-check, tests, and build must pass.

## License

MIT — see [LICENSE](LICENSE).


## Calculator MCP server

`cd backend && npm run mcp` starts a read-only stdio MCP server (`annuity_income`, `retirement_historical_replay`, `federal_income_tax`). Pure functions, no database or client data; every result carries the educational disclosure.
