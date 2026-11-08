# Fiduciary OS — Application

The code for Fiduciary OS: a planning platform with free tools for households and a white-label workspace for financial advisors. For the business plan, value flow, and go-to-market gates, start at the [repository README](../README.md).

> [!NOTE]
> The **backend API prototype** and a **standalone illustrative frontend preview** are implemented. The frontend is not connected to the API and stores no real records. Docker images, Kubernetes manifests, and Terraform described in the architecture docs are not implemented.

---

## Modules

| Module | Backend support today | Frontend |
|---|---|---|
| Annuity Navigator | `POST /calculations/annuity` — simplified payout estimate | Planned |
| Life Insurance Navigator | `POST /calculations/life-insurance` — protection gap; `POST /market/insurance/quotes` — **illustrative figures only**, anonymised carriers | Planned |
| Retirement Income Navigator | `POST /calculations/retirement` — withdrawal-rate heuristic | Planned |
| Tax Planning | `POST /calculations/tax` — 2024 federal brackets and standard deductions (all filing statuses) | Planned |
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
| Frontend | React + TypeScript + Vite; in-memory sample workflow | Production API integration; Tailwind ([recommended stack](../VALUE_FLOW_AND_REPO_ROADMAP.md#1-experience--aesthetics)) |
| CI | Separate backend and frontend type-check, test and build workflows | Images and deploy |

---

## Frontend preview

```bash
cd frontend
npm ci                   # Node.js 24+
npm run dev
```

See [preview scope and acceptance checks](frontend/README.md). Sample data only; no API connection, real authorization, or live execution.

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
DATABASE_URL=file:./test.db JWT_SECRET=test npx jest --runInBand
```

The `Makefile` and `docker-compose.yml` still reference missing frontend Dockerfiles and `infra/`; they are not a supported way to run the frontend preview. Use the commands above.

---

## Security posture

Implemented: bcrypt password hashing, separate access and refresh tokens, Helmet headers, CORS allow-list, rate limiting, per-user scoping on every data route, validated-field-only writes on profile updates, PII stripped before AI calls, an AI prompt/response supervision log, and placeholder data refused when `NODE_ENV=production`.

**Not** implemented or attested: SOC 2, WCAG conformance testing, encryption of stored documents, MFA, general audit logging (beyond the AI log), penetration testing. The [Security Architecture](../Security_Architecture.md) document describes the target controls.

Report security issues privately to the repository owner rather than in a public issue.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Linting currently reports pre-existing findings and is non-blocking in CI; type-check, tests, and build must pass.

## License

MIT — see [LICENSE](LICENSE).
