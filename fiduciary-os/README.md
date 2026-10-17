# Fiduciary OS™

<p align="center">
  <img src="frontend/src/assets/logo.svg" alt="Fiduciary OS Logo" width="200"/>
</p>

<p align="center">
  <strong>The Intelligent Financial Operating System for Advisors and Clients</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#documentation">Documentation</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## Overview

Fiduciary OS™ is a comprehensive, dual-sided financial platform that bridges the gap between financial advisors (B2B) and their clients (B2C). Built with modern web technologies and designed for white-label enterprise deployment, it provides real-time financial intelligence, AI-powered insights, and seamless portfolio management.

### Key Capabilities

- **Fleet of Navigators**: Specialized modules for Annuities, Life Insurance, Investments, and Retirement
- **AI-Powered Insights**: Claude-powered financial analysis and recommendations
- **Real-time Analytics**: Live portfolio tracking, risk assessment, and market data
- **White-Label Ready**: Enterprise customization for RIAs, broker-dealers, and financial institutions
- **Bank-Grade Security**: SOC 2 compliant with end-to-end encryption

---

## Features

### 🎯 Core Modules

| Module | Description | Status |
|--------|-------------|--------|
| **Annuity Navigator™** | Longevity risk mitigation & guaranteed income modeling | ✅ Live |
| **Life Insurance Navigator™** | Protection gap analysis & carrier comparison | ✅ Live |
| **Investment X-Ray™** | Portfolio analysis, fee drag, tax efficiency | ✅ Live |
| **Retirement Income Navigator™** | Withdrawal strategy & longevity stress testing | ✅ Live |
| **Symphony Composer™** | Holistic financial score & unified playbook | ✅ Live |
| **Tax Planning** | US tax code integration & strategy simulator | ✅ Live |
| **Digital Assets Intelligence™** | Crypto portfolio modeling & AI insights | ✅ Live |
| **Risk Analytics** | Stress testing & scenario analysis | ✅ Live |
| **Estate Engine™** | Legacy planning & wealth transfer | ✅ Live |
| **The Vault** | Secure document storage & key management | ✅ Live |

### 🎨 Design System

- **Dark Theme**: Professional aesthetic with cyan/gold/purple/sage accents
- **Responsive**: Mobile-first design with breakpoint optimization
- **Accessible**: WCAG 2.1 AA compliant
- **Animations**: Smooth transitions and micro-interactions

---

## Tech Stack

### Frontend
- **Framework**: React 18+ with TypeScript
- **Styling**: Tailwind CSS + CSS Modules
- **State Management**: Zustand + React Query
- **Charts**: Chart.js + Recharts
- **Build Tool**: Vite
- **Testing**: Vitest + React Testing Library

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL 15+ (primary), Redis (cache/sessions)
- **ORM**: Prisma
- **Authentication**: Auth0 / Firebase Auth
- **API**: REST + WebSocket for real-time updates

### Infrastructure
- **Containerization**: Docker + Docker Compose
- **Orchestration**: Kubernetes (production)
- **IaC**: Terraform
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus + Grafana

---

## Quick Start

### Prerequisites

- Node.js 20+ and npm 10+
- Docker and Docker Compose
- PostgreSQL 15+ (or use Docker)

### Clone and Setup

```bash
# Clone the repository
git clone https://github.com/your-org/fiduciary-os.git
cd fiduciary-os

# Install dependencies
make install

# Setup environment
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env

# Start development environment
make dev
```

### Environment Configuration

Edit the environment files:

**frontend/.env**
```env
VITE_API_URL=http://localhost:3001
VITE_AUTH0_DOMAIN=your-auth0-domain
VITE_AUTH0_CLIENT_ID=your-client-id
VITE_WEBSOCKET_URL=ws://localhost:3001
```

**backend/.env**
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/fiduciary_os
REDIS_URL=redis://localhost:6379
AUTH0_DOMAIN=your-auth0-domain
AUTH0_AUDIENCE=your-api-identifier
JWT_SECRET=your-jwt-secret
```

### Development Commands

```bash
# Start all services
make dev

# Start frontend only
make dev-frontend

# Start backend only
make dev-backend

# Run tests
make test

# Run linting
make lint

# Build for production
make build

# Deploy to staging
make deploy-staging
```

---

## Project Structure

```
fiduciary-os/
├── frontend/           # React + TypeScript frontend
│   ├── src/
│   │   ├── components/ # Reusable UI components
│   │   ├── pages/      # Page components
│   │   ├── navigators/ # Fleet of Navigators modules
│   │   ├── hooks/      # Custom React hooks
│   │   ├── store/      # Zustand state management
│   │   ├── services/   # API services
│   │   ├── utils/      # Utility functions
│   │   ├── types/      # TypeScript types
│   │   └── styles/     # Global styles, themes
│   └── public/         # Static assets
├── backend/            # Node.js/Express API
│   ├── src/
│   │   ├── controllers/# Route controllers
│   │   ├── services/   # Business logic
│   │   ├── models/     # Database models
│   │   ├── routes/     # API routes
│   │   ├── middleware/ # Auth, validation
│   │   └── utils/      # Utilities
│   └── tests/          # Test suites
├── infra/              # Infrastructure as Code
│   ├── docker/         # Docker configurations
│   ├── kubernetes/     # K8s manifests
│   └── terraform/      # Terraform modules
└── docs/               # Documentation
    ├── api/            # API documentation
    ├── architecture/   # Architecture docs
    └── deployment/     # Deployment guides
```

---

## Documentation

- [Development Setup](docs/development/setup.md)
- [Architecture Overview](docs/architecture/overview.md)
- [API Reference](docs/api/README.md)
- [Deployment Guide](docs/deployment/README.md)
- [Contributing Guidelines](CONTRIBUTING.md)

---

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Security

- 🔒 SOC 2 Type II compliant infrastructure
- 🔐 End-to-end encryption for sensitive data
- 🛡️ Regular security audits and penetration testing
- 📋 Responsible disclosure program

For security concerns, please email security@fiduciaryos.com

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Support

- 📧 Email: support@fiduciaryos.com
- 💬 Discord: [Join our community](https://discord.gg/fiduciaryos)
- 📖 Documentation: [docs.fiduciaryos.com](https://docs.fiduciaryos.com)

---

<p align="center">
  <sub>Built with 💙 by the Fiduciary OS™ Team</sub>
</p>
