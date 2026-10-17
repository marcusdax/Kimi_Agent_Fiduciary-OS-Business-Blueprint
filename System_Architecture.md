# Fiduciary OS™ - System Architecture

## Executive Summary

Fiduciary OS™ is a dual-sided B2B/B2C financial advisory platform designed to serve both individual consumers ("My Financial Life" portal) and financial advisors ("Advisor Command Center"). The platform features a modular "Fleet of Navigators" architecture supporting specialized financial tools for annuities, life insurance, investments, and retirement planning.

---

## High-Level Architecture

```mermaid
flowchart TB
    subgraph "Client Layer"
        WEB[React Web App]
        MOB[Mobile App - React Native]
        B2B[Advisor Dashboard]
        API_CLIENT[API Clients]
    end

    subgraph "API Gateway Layer"
        GW[API Gateway<br/>Kong/AWS API Gateway]
        LB[Load Balancer<br/>NGINX/ALB]
        CDN[CloudFront CDN]
    end

    subgraph "Application Services"
        subgraph "Core Services"
            AUTH[Auth Service<br/>OAuth2/JWT]
            USER[User Service]
            PROFILE[Profile Service]
            NOTIF[Notification Service]
        end
        
        subgraph "Navigator Services"
            ANN[Annuity Navigator]
            LIFE[Life Insurance Navigator]
            INV[Investment X-Ray]
            RET[Retirement Navigator]
            TAX[Tax Planning Service]
            CRYPTO[Digital Assets Service]
            ESTATE[Estate Engine]
            RISK[Risk Analytics]
        end
        
        subgraph "Intelligence Layer"
            AI[AI/ML Service]
            NLP[NLP Document Analysis]
            REC[Recommendation Engine]
            SCORE[Lead Scoring Service]
        end
    end

    subgraph "Data Layer"
        PG[(PostgreSQL<br/>Primary Data)]
        TS[(TimescaleDB<br/>Time Series)]
        REDIS[(Redis<br/>Cache/Session)]
        ES[(Elasticsearch<br/>Search)]
        S3[(S3/MinIO<br/>Documents)]
        MQ[(RabbitMQ/Kafka<br/>Event Bus)]
    end

    subgraph "Integration Layer"
        PLAID[Plaid Adapter]
        CARRIER[Carrier API Hub]
        MARKET[Market Data Service]
        WEBHOOK[Webhook Manager]
    end

    subgraph "External APIs"
        PLAID_API[Plaid]
        ANNUITY_API[Annuity Rate Watch]
        WINK[Wink, Inc.]
        COMP[Compulife]
        MSTAR[Morningstar]
        BLOOM[Bloomberg]
        YFIN[Yahoo Finance]
        FRED[FRED Economic]
    end

    WEB --> CDN
    MOB --> CDN
    B2B --> CDN
    API_CLIENT --> LB
    CDN --> LB
    LB --> GW
    
    GW --> AUTH
    GW --> USER
    GW --> PROFILE
    
    AUTH --> REDIS
    USER --> PG
    PROFILE --> PG
    
    GW --> ANN
    GW --> LIFE
    GW --> INV
    GW --> RET
    GW --> TAX
    GW --> CRYPTO
    GW --> ESTATE
    GW --> RISK
    
    ANN --> TS
    LIFE --> PG
    INV --> TS
    RET --> TS
    
    ANN --> AI
    INV --> AI
    RET --> AI
    LIFE --> AI
    
    AI --> NLP
    AI --> REC
    AI --> SCORE
    
    NLP --> S3
    REC --> REDIS
    SCORE --> PG
    
    ANN --> CARRIER
    LIFE --> CARRIER
    INV --> MARKET
    CRYPTO --> MARKET
    
    CARRIER --> ANNUITY_API
    CARRIER --> WINK
    CARRIER --> COMP
    MARKET --> MSTAR
    MARKET --> BLOOM
    MARKET --> YFIN
    MARKET --> FRED
    
    PLAID --> PLAID_API
    
    GW --> NOTIF
    NOTIF --> MQ
    MQ --> WEBHOOK
    
    PG --> ES
    TS --> ES
```

---

## Component Breakdown

### 1. Frontend Layer

| Component | Technology | Purpose |
|-----------|------------|---------|
| B2C Portal (My Financial Life) | React 18+, TypeScript | Consumer-facing financial tools |
| B2B Portal (Advisor Command Center) | React 18+, TypeScript | White-label advisor platform |
| Mobile App | React Native | iOS/Android companion app |
| Design System | Tailwind CSS + Custom Components | Consistent UI/UX |
| State Management | Zustand/Redux Toolkit | Global state management |
| Charts/Visualizations | Chart.js, D3.js | Financial data visualization |

### 2. API Gateway Layer

| Component | Technology | Purpose |
|-----------|------------|---------|
| API Gateway | Kong or AWS API Gateway | Request routing, rate limiting |
| Load Balancer | NGINX / AWS ALB | Traffic distribution |
| CDN | CloudFront / Cloudflare | Static asset delivery |
| WAF | AWS WAF / Cloudflare | DDoS protection, SQL injection prevention |

### 3. Core Services

#### 3.1 Authentication Service
- **Technology**: Node.js/Express or Go
- **Responsibilities**:
  - OAuth 2.0 / OpenID Connect implementation
  - JWT token generation and validation
  - Multi-factor authentication (MFA)
  - Session management
  - Role-based access control (RBAC)

#### 3.2 User Service
- **Technology**: Node.js/NestJS
- **Responsibilities**:
  - User registration and profile management
  - KYC/AML verification workflows
  - Advisor-client relationship mapping
  - User preferences and settings

#### 3.3 Profile Service
- **Technology**: Node.js/NestJS
- **Responsibilities**:
  - Financial profile management
  - Risk tolerance assessment
  - Goal tracking and milestones
  - Financial DNA scoring

#### 3.4 Notification Service
- **Technology**: Node.js/Bull Queue
- **Responsibilities**:
  - Email notifications (SendGrid/AWS SES)
  - SMS alerts (Twilio)
  - Push notifications (Firebase)
  - In-app notification center

### 4. Navigator Services (Fleet of Navigators)

#### 4.1 Annuity Navigator™
```mermaid
flowchart LR
    A[Annuity API] --> B[Rate Calculator]
    B --> C[Carrier Comparison]
    C --> D[Income Projection]
    D --> E[Recommendation Engine]
    E --> F[User Dashboard]
    
    G[Annuity Rate Watch] --> A
    H[Wink, Inc.] --> A
    I[Compulife] --> A
```

**Key Features**:
- Multi-carrier rate aggregation
- Income projection modeling
- COLA rider analysis
- Joint life option calculations

#### 4.2 Life Insurance Navigator™
```mermaid
flowchart LR
    A[User Input] --> B[Needs Analysis]
    B --> C[Gap Calculator]
    C --> D[Carrier Quoting]
    D --> E[Premium Comparison]
    E --> F[Recommendation]
    
    G[Health Classifier] --> B
    H[Carrier APIs] --> D
```

**Key Features**:
- Protection gap analysis
- Health class estimation
- Multi-carrier quoting
- Term vs. permanent comparison

#### 4.3 Investment X-Ray™
```mermaid
flowchart LR
    A[Portfolio Data] --> B[Allocation Analysis]
    B --> C[Fee Drag Calculator]
    C --> D[Risk Metrics]
    D --> E[Rebalancing Engine]
    E --> F[Efficient Frontier]
    
    G[Morningstar API] --> A
    H[Bloomberg API] --> D
    I[Yahoo Finance] --> G
```

**Key Features**:
- Portfolio allocation breakdown
- Fee drag analysis
- Sharpe/Sortino ratio calculations
- Rebalancing recommendations
- Efficient frontier positioning

#### 4.4 Retirement Income Navigator™ (The Maestro)
```mermaid
flowchart LR
    A[Retirement Params] --> B[Withdrawal Strategy]
    B --> C[Monte Carlo Simulation]
    C --> D[Success Probability]
    D --> E[Income Projection]
    E --> F[Strategy Comparison]
```

**Key Features**:
- Multiple withdrawal strategies (4% rule, dynamic, guardrails)
- Monte Carlo simulation
- Longevity stress testing
- Social Security optimization

### 5. Intelligence Layer

#### 5.1 AI/ML Service
```mermaid
flowchart TB
    subgraph "AI/ML Pipeline"
        A[Feature Engineering] --> B[Model Training]
        B --> C[Model Registry]
        C --> D[Inference API]
    end
    
    subgraph "Models"
        M1[Lead Scoring Model]
        M2[Churn Prediction]
        M3[Portfolio Optimization]
        M4[Risk Assessment]
    end
    
    D --> M1
    D --> M2
    D --> M3
    D --> M4
```

**Technologies**:
- Python/FastAPI for service layer
- scikit-learn, XGBoost for ML models
- MLflow for model registry
- AWS SageMaker or GCP Vertex AI for training

#### 5.2 NLP Document Analysis
**Capabilities**:
- Insurance policy document parsing
- 401(k) statement extraction
- Tax document analysis
- Named entity recognition for financial entities

**Technologies**:
- Python/spaCy or AWS Comprehend
- OpenAI GPT-4 for complex document understanding
- Tesseract OCR for scanned documents

#### 5.3 Recommendation Engine
- Collaborative filtering for product recommendations
- Content-based filtering for educational content
- Hybrid approach combining both

### 6. Data Layer

#### 6.1 Primary Database (PostgreSQL)
```mermaid
erDiagram
    USERS ||--o{ PROFILES : has
    USERS ||--o{ ACCOUNTS : owns
    USERS ||--o{ GOALS : sets
    ADVISORS ||--o{ CLIENTS : manages
    ACCOUNTS ||--o{ TRANSACTIONS : contains
    ACCOUNTS ||--o{ HOLDINGS : contains
```

**Configuration**:
- Primary-Replica setup for read scaling
- Connection pooling via PgBouncer
- Automated backups (hourly incremental, daily full)

#### 6.2 Time Series Database (TimescaleDB)
**Use Cases**:
- Portfolio value history
- Market data caching
- Annuity rate history
- User activity metrics

#### 6.3 Cache Layer (Redis)
**Use Cases**:
- Session storage
- API response caching
- Rate limiting counters
- Real-time leaderboards

#### 6.4 Search (Elasticsearch)
**Use Cases**:
- Document search in The Vault
- Advisor directory search
- Product search across carriers

#### 6.5 Object Storage (S3/MinIO)
**Use Cases**:
- Secure document storage (The Vault)
- User profile images
- Exported reports
- Audit logs

#### 6.6 Message Queue (RabbitMQ/Kafka)
**Use Cases**:
- Async job processing
- Event-driven attribution tracking
- Real-time notifications
- Data pipeline processing

---

## Service Architecture Recommendation

### Microservices vs. Monolith Analysis

| Criteria | Microservices | Modular Monolith | Recommendation |
|----------|---------------|------------------|----------------|
| Team Size | Multiple teams | Small team | **Start with Modular Monolith** |
| Deployment Complexity | High | Low | Modular Monolith for MVP |
| Scalability | Independent scaling | Scale as unit | Microservices for specific high-load services |
| Data Consistency | Eventual consistency | Strong consistency | Strong consistency preferred for financial data |
| Development Velocity | Slower initially | Faster | Modular Monolith for faster iteration |

### Recommended Architecture: Hybrid Approach

```mermaid
flowchart TB
    subgraph "Monolithic Core"
        CORE[Core Platform<br/>User, Profile, Auth]
    end
    
    subgraph "Microservices"
        AI[AI/ML Service]
        NLP[NLP Service]
        NOTIF[Notification Service]
        MARKET[Market Data Service]
    end
    
    subgraph "Serverless Functions"
        WEBHOOK[Webhook Handlers]
        EXPORT[Report Generation]
        CALC[Complex Calculations]
    end
    
    CORE --> AI
    CORE --> NLP
    CORE --> NOTIF
    CORE --> MARKET
    CORE --> WEBHOOK
    CORE --> EXPORT
    CORE --> CALC
```

**Rationale**:
1. **Core Platform as Modular Monolith**: Faster development, easier testing, ACID transactions
2. **AI/ML as Separate Service**: Different scaling needs, Python-based stack
3. **Market Data as Separate Service**: High throughput requirements, specialized caching
4. **Serverless for Spiky Workloads**: Webhooks, report generation

---

## Data Flow Diagrams

### 1. User Registration Flow
```mermaid
sequenceDiagram
    participant U as User
    participant W as Web App
    participant GW as API Gateway
    participant A as Auth Service
    participant US as User Service
    participant P as PostgreSQL
    participant R as Redis
    participant E as Elasticsearch

    U->>W: Register
    W->>GW: POST /api/v1/auth/register
    GW->>A: Validate & Create Account
    A->>P: Create User Record
    A->>R: Store Session
    A->>US: Create Profile
    US->>P: Create Profile Record
    US->>E: Index User
    A-->>GW: JWT Token
    GW-->>W: 201 Created + Token
    W-->>U: Redirect to Dashboard
```

### 2. Annuity Quote Flow
```mermaid
sequenceDiagram
    participant U as User
    participant W as Web App
    participant GW as API Gateway
    participant AN as Annuity Service
    participant C as Carrier Hub
    participant ARW as Annuity Rate Watch
    participant WINK as Wink API
    participant TS as TimescaleDB
    participant AI as AI Service

    U->>W: Configure Annuity
    W->>GW: POST /api/v1/annuity/quote
    GW->>AN: Process Request
    par Parallel Carrier Calls
        AN->>C: Request Rates
        C->>ARW: Get Rates
        C->>WINK: Get Rates
    end
    C-->>AN: Aggregated Rates
    AN->>TS: Cache Rates
    AN->>AI: Get Recommendations
    AI-->>AN: Personalized Recs
    AN->>AN: Calculate Projections
    AN-->>GW: Quote Response
    GW-->>W: Display Results
    W-->>U: Show Quotes & Charts
```

### 3. Portfolio Analysis Flow
```mermaid
sequenceDiagram
    participant U as User
    participant W as Web App
    participant GW as API Gateway
    participant INV as Investment Service
    participant PLAID as Plaid Adapter
    participant PLAID_API as Plaid API
    participant MSTAR as Morningstar
    participant AI as AI Service
    participant TS as TimescaleDB

    U->>W: Link Account
    W->>GW: POST /api/v1/plaid/link
    GW->>PLAID: Create Link Token
    PLAID->>PLAID_API: Initialize Link
    PLAID_API-->>U: Plaid Link UI
    U->>PLAID_API: Authenticate Bank
    PLAID_API-->>PLAID: Public Token
    PLAID->>PLAID_API: Exchange Token
    PLAID_API-->>PLAID: Access Token
    PLAID->>PLAID_API: Fetch Holdings
    PLAID_API-->>PLAID: Account Data
    PLAID->>INV: Sync Holdings
    INV->>MSTAR: Enrich Security Data
    MSTAR-->>INV: Security Details
    INV->>AI: Analyze Portfolio
    AI-->>INV: Risk Metrics & Recs
    INV->>TS: Store Analysis
    INV-->>GW: Portfolio X-Ray
    GW-->>W: Display Analysis
```

### 4. Document Analysis Flow (NLP)
```mermaid
sequenceDiagram
    participant U as User
    participant W as Web App
    participant GW as API Gateway
    participant V as Vault Service
    participant S3 as S3 Storage
    participant NLP as NLP Service
    participant PG as PostgreSQL

    U->>W: Upload Document
    W->>GW: POST /api/v1/vault/upload
    GW->>V: Process Upload
    V->>S3: Store Encrypted File
    S3-->>V: File Location
    V->>NLP: Analyze Document
    NLP->>NLP: OCR (if needed)
    NLP->>NLP: Extract Entities
    NLP->>NLP: Classify Document
    NLP-->>V: Extracted Data
    V->>PG: Store Metadata
    V-->>GW: Upload Complete
    GW-->>W: Show Results
    W-->>U: Document Processed
```

---

## Integration Architecture

### Dynamic Source Router
```mermaid
flowchart TB
    subgraph "Dynamic Source Router"
        A[Request Router] --> B[Source Registry]
        B --> C[Health Checker]
        C --> D[Failover Manager]
        D --> E[Response Aggregator]
    end
    
    subgraph "Data Sources"
        S1[Primary Source]
        S2[Secondary Source]
        S3[Fallback Source]
    end
    
    E --> S1
    E --> S2
    E --> S3
    
    S1 -.->|Failover| S2
    S2 -.->|Failover| S3
```

**Implementation Details**:
- Circuit breaker pattern for resilience
- Configurable timeout and retry policies
- Response caching with TTL
- Source priority configuration

### Event-Driven Attribution Tracking
```mermaid
flowchart TB
    subgraph "Event Pipeline"
        A[Event Producer] --> B[Event Bus]
        B --> C[Event Router]
        C --> D1[Attribution Service]
        C --> D2[Analytics Service]
        C --> D3[Notification Service]
    end
    
    subgraph "Event Types"
        E1[User Action]
        E2[Quote Request]
        E3[Conversion]
        E4[Advisor Interaction]
    end
    
    E1 --> A
    E2 --> A
    E3 --> A
    E4 --> A
```

**Event Schema**:
```json
{
  "event_id": "uuid",
  "event_type": "quote_requested",
  "timestamp": "2025-01-15T10:30:00Z",
  "user_id": "user_uuid",
  "session_id": "session_uuid",
  "advisor_id": "advisor_uuid",
  "source": "annuity_navigator",
  "properties": {
    "product_type": "fixed_indexed",
    "principal": 200000,
    "deferral_period": 5
  },
  "attribution": {
    "utm_source": "google",
    "utm_medium": "cpc",
    "utm_campaign": "retirement_2025"
  }
}
```

---

## Technology Stack Summary

| Layer | Technology | Alternative |
|-------|------------|-------------|
| Frontend | React 18+, TypeScript | Vue 3, Angular |
| Mobile | React Native | Flutter |
| API Gateway | Kong | AWS API Gateway, NGINX |
| Core Services | Node.js/NestJS | Go, Python/FastAPI |
| AI/ML | Python/FastAPI | - |
| Primary DB | PostgreSQL 15+ | MySQL 8 |
| Time Series | TimescaleDB | InfluxDB |
| Cache | Redis 7+ | Memcached |
| Search | Elasticsearch | OpenSearch |
| Message Queue | RabbitMQ | Apache Kafka |
| Object Storage | AWS S3 | MinIO, GCS |
| Container Orchestration | Kubernetes | AWS ECS |
| CI/CD | GitHub Actions | GitLab CI, Jenkins |
| Monitoring | Datadog | New Relic, Grafana |
| Logging | ELK Stack | Splunk |

---

## Scalability Considerations

### Horizontal Scaling Strategy
1. **Stateless Services**: All application services designed to be stateless
2. **Database Read Replicas**: Read-heavy queries served by replicas
3. **Caching Strategy**: Multi-layer caching (CDN, Redis, Application)
4. **Async Processing**: Heavy computations offloaded to background jobs

### Performance Targets
| Metric | Target | Measurement |
|--------|--------|-------------|
| API Response Time (p95) | < 200ms | API Gateway metrics |
| Page Load Time | < 2s | Real User Monitoring |
| Database Query Time (p95) | < 50ms | PostgreSQL logs |
| Report Generation | < 30s | Background job metrics |
| Document Processing | < 60s | NLP service metrics |

---

## Next Steps

1. **Infrastructure Setup**: Provision development and staging environments
2. **Core Services Implementation**: Start with Auth, User, and Profile services
3. **Database Migration Strategy**: Design schema versioning and migration plan
4. **API Contract Definition**: Finalize OpenAPI specifications
5. **Security Audit**: Conduct initial security review
6. **Performance Baseline**: Establish performance benchmarks

---

*Document Version: 1.0*
*Last Updated: January 2025*
*Owner: Engineering Architecture Team*
