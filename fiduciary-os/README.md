# Fiduciary OS — Application

The code for Fiduciary OS: a planning platform with free tools for households and a white-label workspace for financial advisors. For the business plan, value flow, and go-to-market gates, start at the [repository README](../README.md).

> [!NOTE]
> Only the **backend API** is implemented. The frontend, Docker images, Kubernetes manifests, and Terraform described in the architecture docs are not in this repository yet.

---

## Modules

| Module | Backend support today | Frontend |
|---|---|---|
| Annuity Navigator | `POST /calculations/annuity` — simplified payout estimate | Planned |
| Life Insurance Navigator | `POST /calculations/life-insurance` — protection gap; `POST /market/insurance/quotes` — **illustrative quotes only** | Planned |
| Retirement Income Navigator | `POST /calculations/retirement` — withdrawal-rate heuristic | Planned |
| Tax Planning | `POST /calculations/tax` — hard-coded federal brackets | Planned |
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
| AI | Anthropic and Moonshot Kimi HTTP clients with canned fallbacks | Supervised, logged, evaluated AI |
| Frontend | — | React, TypeScript, Tailwind ([recommended stack](../VALUE_FLOW_AND_REPO_ROADMAP.md#1-experience--aesthetics)) |
| CI | GitHub Actions: type-check, test, build ([workflow](../.github/workflows/backend-ci.yml)) | + frontend, images, deploy |

---

## Quick start

```bash
cd backend
cp .env.example .env        # set JWT_SECRET
npm ci
npx prisma migrate deploy
npm run dev                 # http://localhost:3001  ·  health: /health
```

Tests:

```bash
DATABASE_URL=file:./test.db JWT_SECRET=test npx jest --runInBand
```

The `Makefile` and `docker-compose.yml` still reference `frontend/` and `infra/`; only the `*-backend` and `db-*` targets work today.

---

## Security posture

Implemented: bcrypt password hashing, separate access and refresh tokens, Helmet headers, CORS allow-list, rate limiting, per-user scoping on every data route, validated-field-only writes on profile updates.

**Not** implemented or attested: SOC 2, WCAG conformance testing, encryption of stored documents, MFA, audit logging, penetration testing. The [Security Architecture](../Security_Architecture.md) document describes the target controls.

Report security issues privately to the repository owner rather than in a public issue.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Linting currently reports pre-existing findings and is non-blocking in CI; type-check, tests, and build must pass.

## License

MIT — see [LICENSE](LICENSE).
