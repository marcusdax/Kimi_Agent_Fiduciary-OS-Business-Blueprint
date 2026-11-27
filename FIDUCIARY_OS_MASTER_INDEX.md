# AUCTUM.ATLAS & AUCTUM Command (Fiduciary OS™) — Master Documentation Index

> **Unified Dual-Sided Wealth & Advisory Platform Documentation Suite**  
> Version 2.0 | Updated: November 2026 | Canonical Blueprint: [`UNIFIED_PLATFORM_BLUEPRINT.md`](UNIFIED_PLATFORM_BLUEPRINT.md)

> [!NOTE]
> This index describes the **unified target and active implementation** architecture. See [README.md](README.md#what-exists-today) for repository build status and [`UNIFIED_PLATFORM_BLUEPRINT.md`](UNIFIED_PLATFORM_BLUEPRINT.md) for the canonical 6-pillar specification.

---

## Executive Overview

**AUCTUM.ATLAS** and **AUCTUM Command (powered by Fiduciary OS™)** form a single dual-sided B2C/B2B wealth and advisory ecosystem:
- **AUCTUM.ATLAS (Consumer / Household Portal):** Warm, plain-language family learning and household stewardship portal (*"Build a Future for Your Family, One Step at a Time."*) following a continuous 5-stage household flow (`Discover & Orient` → `Learn & Assess` → `Map & Model` → `Verify & Escalate` → `Steward & Transfer`).
- **AUCTUM Command (Licensed Advisor & Compliance Core, powered by Fiduciary OS™):** Institutional advisor workstation with live PostgreSQL 16 + `pgcrypto` Household Graph CRM, multi-carrier quoting, K-Dense Dual-Record Provenance inspection, Temporal HITL approval queues, and 7-year FINRA 4511 WORM archiving.

### Core Value Proposition
- **For Households (`AUCTUM.ATLAS`)**: Jargon-free planning studios, 5-minute micro-lessons, WCAG 2.2 accessible visualizations, and transparent educational guardrails
- **For Advisors (`AUCTUM Command`)**: White-label fiduciary workstation automating calculations, carrier comparisons, provenance verification, and compliance recordkeeping
- **For the Ecosystem**: A unified flywheel where plain-language household stewardship feeds qualified, educated families into licensed advisory relationships

---

## 📁 Complete Documentation Suite

### 1. Business Strategy & Market Analysis

| Document | Description | File Path |
|----------|-------------|-----------|
| **Unified Platform Blueprint** | Canonical 6-pillar architecture (AUCTUM.ATLAS + AUCTUM Command), lexicon, 6 charts, compliance gates, Phases 1–4, 5 Founder Decisions | [`UNIFIED_PLATFORM_BLUEPRINT.md`](UNIFIED_PLATFORM_BLUEPRINT.md) |
| **VC Executive Summary** | Investor overview: market, model v2 financials, $5M seed ask | [`VC_Executive_Summary.md`](VC_Executive_Summary.md) |
| **Market Analysis Report** | Comprehensive market sizing ($150B+ TAM), growth drivers (15-31% CAGR), customer segmentation | [`Market_Analysis_Report.md`](Market_Analysis_Report.md) |
| **Business Strategy Plan** | 4-phase GTM strategy, customer acquisition, partnership strategy, product roadmap | [`Business_Strategy_Plan.md`](Business_Strategy_Plan.md) |
| **Competitive Analysis** | Direct/indirect competitors, positioning matrix, moat analysis, response scenarios | [`Competitive_Analysis.md`](Competitive_Analysis.md) |

**Key Market Metrics:**
- **TAM**: $150B+ (combined financial planning, RIA software, insurtech)
- **SAM**: ~$153M annual subscription revenue potential (partnership revenue excluded)
- **5-year plan**: $19.95M ARR / $21.05M pure-SaaS revenue in Year 5 (v2.0 Base Case; excludes legacy v1 $28.02M unlicensed rev-share; $51.7M Licensed-Partner Upside Case strictly gated on legal/channel sign-off — see [`FINANCIAL_MODEL_PACKAGE.md`](FINANCIAL_MODEL_PACKAGE.md#year-5-revenue-reconciliation))
- **CAGR**: 15-31% across target markets

---

### 2. Financial Models & Valuation

| Document | Description | File Path |
|----------|-------------|-----------|
| **01_Assumptions.csv** | All model assumptions (CAC, churn, ARPU, growth rates) | `01_Assumptions.csv` |
| **02_B2B_Revenue.csv** | B2B revenue projections by tier | `02_B2B_Revenue.csv` |
| **03_B2C_Revenue.csv** | B2C revenue projections (freemium model) | `03_B2C_Revenue.csv` |
| **04_Income_Statement.csv** | 5-year consolidated P&L | `04_Income_Statement.csv` |
| **05_Cash_Flow.csv** | Operating, investing, financing cash flows | `05_Cash_Flow.csv` |
| **06_SaaS_Metrics.csv** | ARR, MRR, LTV, CAC, LTV/CAC ratios, Magic Number | `06_SaaS_Metrics.csv` |
| **07_Scenario_Analysis.csv** | Conservative/Base/Optimistic scenarios | `07_Scenario_Analysis.csv` |
| **Valuation Analysis** | DCF, ARR multiples, VC method (comparables to be rebuilt from sourced data) | `Valuation_Analysis.md` |
| **Unit Economics** | LTV, CAC, payback periods, margin analysis | `Unit_Economics.md` |
| **Funding Strategy** | Seed/Series A/B roadmap, investor targets, exit analysis | `Funding_Strategy.md` |

**Financial Highlights (Base Case):**

| Metric | Year 1 | Year 3 | Year 5 |
|--------|--------|--------|--------|
| Revenue | $1.44M | $8.00M | $21.05M |
| ARR | $1.37M | $7.59M | $19.95M |
| Gross Margin | 70% | 77% | 80% |
| EBITDA | −$1.11M | −$1.36M | $1.99M |
| LTV/CAC (B2B, assumed) | 9.9–15.0× | 9.9–15.0× | 9.9–15.0× |
| Payback Period (B2B) | 6.67–6.73 months | 6.67–6.73 months | 6.67–6.73 months |

Model v2.1 (November 2026) excludes unlicensed insurance revenue share, corrects LTV, and reconciles Year 5 Pure-SaaS Base (`$21.05M`) vs. Legacy v1 Reference (`$28.02M`) vs. Gated Licensed-Partner Upside (`$51.7M`). See [`FINANCIAL_MODEL_PACKAGE.md`](FINANCIAL_MODEL_PACKAGE.md) and [`Unit_Economics.md`](Unit_Economics.md).

**Valuation (base case):** methods cluster around $6M–$21M; see [Valuation_Analysis.md](Valuation_Analysis.md).

---

### 3. Technical Architecture

| Document | Description | File Path |
|----------|-------------|-----------|
| **Unified Platform Blueprint** | Canonical dual-sided architecture, 10-row lexicon, 6 charts, K-Dense Provenance, orchestration spine, connectors, Phases 1–4, 5 Founder Decisions | [`UNIFIED_PLATFORM_BLUEPRINT.md`](UNIFIED_PLATFORM_BLUEPRINT.md) |
| **Value Flow & Open-Source Upgrade Roadmap** | OSS & audited connector selection, WCAG 2.2 charting stack, Flagger canary rollout, Not Recommended bans | [`VALUE_FLOW_AND_REPO_ROADMAP.md`](VALUE_FLOW_AND_REPO_ROADMAP.md) |
| **System Architecture** | High-level architecture with Mermaid diagrams, microservices design | [`System_Architecture.md`](System_Architecture.md) |
| **API Specification** | RESTful API design, OAuth 2.0/JWT, OpenAPI specs, rate limiting | [`API_Specification.md`](API_Specification.md) |
| **Database Design** | ERD diagrams, PostgreSQL schemas, TimescaleDB, data retention | [`Database_Design.md`](Database_Design.md) |
| **Security Architecture** | Defense in depth; target SOC 2 / GDPR / FINRA-aligned controls (not attested); incident response | [`Security_Architecture.md`](Security_Architecture.md) |
| **Integration Guide** | Plaid integration, Dynamic Source Router design, carrier data via licensed partners (planned), webhooks | [`Integration_Guide.md`](Integration_Guide.md) |
| **Deployment Architecture** | AWS/GCP infrastructure, Kubernetes, CI/CD, monitoring | [`Deployment_Architecture.md`](Deployment_Architecture.md) |

**Architecture Highlights:**
- Continuous 5-stage XState household lifecycle & 11 coupled studios (10 Navigators + Studio #11 Real Property & Tangible Asset Studio)
- WCAG 2.2 AA visualization layer (**Visx 4.0 + Apache ECharts 6.1 + D3 layout math** + paired Accessible Data Tables + Albers/Itten palette)
- Native **PostgreSQL 16 + `pgcrypto` + `pgvector` Household Graph CRM** (`MASTERNEX.os` formally decommissioned)
- **Temporal + LangGraph + Camunda DMN + MCP/A2A** stateful orchestration spine (S3 UUID refs for `>2 MB` payloads)
- **K-Dense Dual-Loop Verification & Dual-Record Provenance** (Living Lab Notebook + unforgeable Provenance Log + RO-Crate 1.1 ZIP export) + Biomimicry 3.8 & Honeybee Democracy 4-Scout Critic
- **4 Runtime Compliance Gates** + 7-year AWS S3 Object Lock WORM + PostgreSQL Append-Only Merkle Hash Chain + `export_user_data` / `soft_delete_user`

---

### 4. Production Repository

**Location:** `fiduciary-os/` (`backend/`, `frontend/`) + `trust-core/` (deterministic math & durable evidence ledger; `MASTERNEX.os` decommissioned)

```
fiduciary-os/
├── README.md                    # Main project documentation
├── LICENSE                      # MIT License
├── .gitignore
├── Makefile                     # Development commands
├── docker-compose.yml           # Docker orchestration
│
├── .github/workflows/
│   └── ci.yml                   # GitHub Actions CI/CD
│
├── frontend/                    # React 19 + Vite 8 + TypeScript 7 + Tailwind
│   ├── package.json
│   ├── src/
│   │   ├── components/          # UI Components, RiskDrawer, AccessibleChartFrame
│   │   ├── pages/               # AUCTUM.ATLAS & AUCTUM Command surfaces
│   │   ├── navigators/          # All 11 coupled studios (10 Navigators + Studio #11 Real Property & Tangible Asset Studio)
│   │   ├── lib/                 # Bifurcated lexicon, XState onboarding machine
│   │   ├── services/            # API services
│   │   └── styles/              # Albers/Itten WCAG 2.2 tokens
│   └── README.md
│
├── backend/                     # Node.js/Express + TypeScript + Prisma
│   ├── package.json
│   ├── prisma/schema.prisma     # PostgreSQL 16 + pgcrypto Household Graph CRM & Merkle audit schema
│   ├── src/
│   │   ├── routes/              # CRM, Consent, Privacy, Compliance, Property, Orchestration, Provenance, Connectors
│   │   ├── middleware/          # Auth0/OIDC, RBAC, validation
│   │   ├── services/            # Compliance gates, K-Dense Dual-Loop, Honeybee governance, PropertyInsight
│   │   └── types/               # TypeScript types
│   └── README.md
│
├── infra/docker/                # Docker configurations
└── docs/                        # Additional documentation

trust-core/                      # Deterministic math engines, 10,000-path MC, Shapley, durable evidence ledger, MCP server
```

**Tech Stack:**
- **Frontend**: React 19, Vite 8, TypeScript 7, XState, Visx 4.0, Apache ECharts 6.1, D3 layout math, Google Maps `AdvancedMarkerElement`
- **Backend**: Node.js, Express, TypeScript, Prisma, PostgreSQL 16 (`pgcrypto` + `pgvector`), Redis, Temporal, LangGraph, Camunda DMN
- **Trust-Core**: Deterministic math engines, durable cryptographic evidence ledger, MCP server
- **Infrastructure**: Docker, Kubernetes, Flagger canary delivery, GitHub Actions, AWS S3 Object Lock WORM

---

## 🚀 Quick Start Guide

### 1. Clone and Setup
```bash
cd fiduciary-os
make install
```

### 2. Environment Configuration
```bash
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
# Edit .env files with your configuration
```

### 3. Run Development Environment
```bash
make dev
```

### 4. Access the Application
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- API Documentation: http://localhost:3001/api-docs

---

## 📊 Key Performance Indicators

### Business Metrics
| KPI | Target |
|-----|--------|
| Customer Acquisition Cost (CAC) | ~$1,011–1,067 blended B2B, $30 B2C |
| Lifetime Value (LTV) | $4,950–$120,000 B2B by tier, $255 B2C |
| LTV/CAC Ratio | 9.9–15.0× B2B, 8.5× B2C (assumptions) |
| Monthly Churn | ≤1.5% B2B, ≤5% B2C |
| Net Revenue Retention | >110% |

### Technical Metrics
| KPI | Target |
|-----|--------|
| API Response Time | <200ms p95 |
| Uptime SLA | 99.9% |
| Data Freshness | <1 hour |
| Security Incidents | 0 critical |

---

## 🎯 Product Roadmap

Aligned with [`UNIFIED_PLATFORM_BLUEPRINT.md`](UNIFIED_PLATFORM_BLUEPRINT.md#7-phased-rollout-roadmap-phases-14--flagger-canary-governance). All production releases are gated by **Flagger progressive canary delivery** (**10%** traffic weight, **30s** health interval, auto-rollback if **error rate > 1%** or **p95 latency > 500 ms**).

### Phase 1: Foundation & Trust Core (Months 1–6)
- [ ] Durable `trust-core` evidence ledger & deterministic math engines
- [ ] WCAG 2.2 AA Design System (Visx 4.0 + ECharts 6.1 + Accessible Data Tables + `lint:copy`)
- [ ] 6-step XState onboarding wizard + zero-login 3-Slider Household Checkup
- [ ] PostgreSQL 16 + `pgcrypto` Household Graph CRM (`MASTERNEX.os` decommissioned)
- [ ] Family Document Binder (Argon2id + OAuth 2.0 PKCE + S3 Object Lock)
- [ ] 2 core literacy studios (Budgeting & Fee Recovery, Retirement Guardrails), Compulife pilot (`$490/yr`), Plaid Trial (`≤10` Prod Items), 25+ discovery interviews

### Phase 2: Multi-Studio Coupling & Live Connectors (Months 7–15)
- [ ] Unified Cash-Flow Router linking Tax, Retirement, Life Insurance + **Studio #11 Real Property & Tangible Asset Studio** (Google Maps `AdvancedMarkerElement`)
- [ ] Annuity Rate Watch (Wink failover) + iPipeline Novera/OneView™ integration
- [ ] Event-driven Plaid FDX (`/transactions/sync` cursors, gated to B2C Premium & Advisor seats)
- [ ] FINRA 2210 / CAN-SPAM / TCPA pre-flight linter on Twilio & SendGrid/SES

### Phase 3: Durable AI Orchestration & Swarm Verification (Months 16–24)
- [ ] Temporal + LangGraph + Camunda DMN spine (S3 UUID refs for `>2 MB` payloads)
- [ ] K-Dense Dual-Loop AI Coach + Frozen Analysis Plan + Provenance Log + RO-Crate 1.1 WORM export
- [ ] Vetted `claude-skills-mcp` (`cisco-ai-skill-scanner --use-behavioral`) + Gemini 4 Interactions grounding
- [ ] Honeybee Democracy Household Alignment Mode & 4-Scout Swarm Critic Gate

### Phase 4: Cross-Border Scale & Multi-Generational Ecosystem (Years 3–5)
- [ ] CANNEX Canadian expansion (RRIFs & Canadian payout annuities, separate Compulife CA Auth ID)
- [ ] 3-generation Household Constellations + NextGen Heir literacy tracks
- [ ] Audited MCP/A2A/REST APIs for CPA & estate-attorney collaboration under 7-year WORM & regional data residency

> **Governance & Strategic Sign-Off:** See the **5 Immediate Founder Decisions** (including Decision #5's 18-file Drive audit and `MASTERNEX.os` decommissioning) and the **Cross-Ecosystem Brand Namespace & `@auctum/engine` Governance Note** in [`UNIFIED_PLATFORM_BLUEPRINT.md`](UNIFIED_PLATFORM_BLUEPRINT.md#8-five-immediate-founder-decisions-with-decision-5-audit-resolution).

---

## 💼 Investment Opportunity

### Funding Rounds

| Round | Amount | Pre-Money | Timing | Use of Funds |
|-------|--------|-----------|--------|--------------|
| Seed | $5M | Market-set (model base case ~$6M–$21M) | Q1 2027 | Product development, initial team |
| Series A | $15M | Set against achieved ARR | Q4 2028 | Scale sales, expand product |
| Series B | ~$40M | — | 2030+ | International, acquisitions (outside the 5-year model) |

### Investment Highlights
- **Massive Market**: $150B+ TAM with 15-31% CAGR
- **Subscription Model**: Advisor SaaS plus consumer premium; no placement-linked revenue
- **Planned Unit Economics**: 8.5–15× LTV/CAC and 2.4–6.7-month payback on stated assumptions
- **Defensible Moat**: AI-native, dual-sided marketplace, data network effects
- **Experienced Team**: (To be added based on actual team)

---

## 📞 Contact & Next Steps

### For Investors
Review the VC Executive Summary and Financial Models for detailed investment information.

### For Partners
Review the Business Strategy Plan and Integration Guide for partnership opportunities.

### For Developers
Clone the repository and follow the setup instructions in `fiduciary-os/README.md`.

---

## 📄 Document Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | April 2026 | Initial comprehensive documentation suite |
| 1.1 | October 2026 | Financials aligned to model v2; unattested compliance claims reworded as targets; revenue share removed |
| 2.0 | November 2026 | Unified AUCTUM.ATLAS + AUCTUM Command architecture; added UNIFIED_PLATFORM_BLUEPRINT.md; aligned Phases 1–4 with Flagger canary gates; documented 5 Founder Decisions, MASTERNEX.os decommissioning, and Brand Namespace Governance Note |

---

## 🔒 Legal Notice

All documents, code, and intellectual property contained herein are proprietary to Fiduciary OS™. Unauthorized distribution or reproduction is strictly prohibited.

---

*Fiduciary OS™ - The New Operating Standard for Modern Financial Advisory*
