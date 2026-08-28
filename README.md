# Jules Supervisor

> **Autonomous, Policy-Controlled AI Orchestration & Supervision Platform for Google Jules**

Jules Supervisor is an enterprise-grade control plane that continuously observes, analyzes, governs, and responds to Google Jules coding sessions through official Google Jules APIs and OpenAI-compatible AI providers (such as OmniRoute, GPT-4o, Claude, or Gemini).

---

## Key Features

- **Official Google Jules API Adapter**: Strongly typed, runtime Zod-validated adapter with exponential backoff, rate limiting, and failure classification.
- **Strict Execution Modes**: `DISABLED`, `DRY_RUN` (Default safe mode), `ASSISTED` (Human review), `AUTO_RESPOND` (Low-risk auto-replies), and `FULL_AUTO`.
- **Deterministic Policy & Risk Engine**: Hard safety veto rules that unconditionally override AI model output for destructive SQL, sensitive file paths, credential tampering, and recursion loops.
- **Prompt Injection Defense**: Repository and agent inputs are tagged as untrusted data (`<untrusted_context>`), isolated from system directives, and audited.
- **Idempotency & Concurrency Gate**: Deterministic SHA-256 idempotency keys and distributed locking prevent duplicate API actions or race conditions across multiple workers.
- **Modern Next.js Control Plane Dashboard**: Real-time KPI metrics, interactive Human Approval Queue with double-submission protection, session explorer, decision auditing, and Server-Sent Events (SSE).
- **Production-Ready Persistence & Queues**: PostgreSQL (Drizzle ORM), BullMQ worker queue with Redis coordination, and standalone in-memory fallbacks for offline testing.
- **Docker & NAS Ready**: Multi-stage lightweight Dockerfiles, Docker Compose stack, and dedicated Synology/TrueNAS runbooks.

---

## Quickstart

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker & Docker Compose (optional for local full-stack)

### Running with Docker Compose

```bash
# 1. Clone repository
git clone https://github.com/angelotejada/Jules-Supervisor.git
cd Jules-Supervisor

# 2. Setup environment variables
cp .env.example .env

# 3. Start PostgreSQL, Redis, Worker, and Web Dashboard
docker compose up -d

# 4. Access Web Control Plane
open http://localhost:3000
```

### Local Development

```bash
# Install dependencies
pnpm install

# Run complete test suite (Unit, Integration, Security, Concurrency, Failure Injection)
npx vitest run

# Run TypeScript compile & strict typechecks
npx tsc --build

# Start Web Control Plane in dev mode
pnpm --filter @jules/web dev

# Start Worker Daemon in dev mode
pnpm --filter @jules/worker dev
```

---

## Architecture Lifecycle

```text
Google Jules
    ↓
Jules API (packages/jules-client)
    ↓
Session / Activity Ingestion (apps/worker)
    ↓
Event Normalization (packages/core)
    ↓
Context Builder with Redaction & Token Budget (packages/ai)
    ↓
AI Decision Engine (OpenAI / OmniRoute)
    ↓
Decision Validation (Zod Schema)
    ↓
Policy Engine & Deterministic Risk Classifier (packages/policy)
    ↓
Execution Gate (DRY_RUN | ASSISTED | AUTO_RESPOND | FULL_AUTO)
    ↓
Jules API Action (Pre-execution state verification + Idempotency Lock)
    ↓
Audit Trail & PostgreSQL Persistence (packages/db)
```

---

## Project Structure

```text
jules-supervisor/
├── apps/
│   ├── web/                     # Next.js 15 App Router Control Plane Dashboard
│   └── worker/                  # Background Supervision Daemon & Poller
├── packages/
│   ├── core/                    # Canonical events, domain types, execution modes, risk
│   ├── db/                      # PostgreSQL client, Drizzle schemas & repositories
│   ├── jules-client/            # Typed Google Jules API client with Zod schemas & mock
│   ├── ai/                      # OpenAI/OmniRoute provider, SSRF guard, context builder
│   ├── policy/                  # Deterministic Policy Engine & Hard Veto rules
│   ├── observability/           # Structured Pino logger with redaction & metric counters
│   ├── config/                  # Strict Zod environment validation
│   ├── shared/                  # Crypto, hashing, sensitive data redaction, sleep utils
│   └── test-utils/              # Test fixtures, mock services, in-memory repository store
├── docs/                        # Complete architecture & operations documentation
├── docker/                      # Multi-stage production Dockerfiles
├── tests/                       # E2E, security, concurrency, and failure-injection tests
├── docker-compose.yml           # Full production container composition
└── pnpm-workspace.yaml          # Monorepo workspace configuration
```

---

## Documentation

- [Architecture & Design](docs/ARCHITECTURE.md)
- [Google Jules API Specification](docs/JULES-API.md)
- [Security Architecture](docs/SECURITY.md)
- [Threat Model & Attack Defense](docs/THREAT-MODEL.md)
- [Policy Engine Rules](docs/POLICY-ENGINE.md)
- [AI Decision Engine](docs/AI-DECISION-ENGINE.md)
- [Operations Runbook](docs/OPERATIONS.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [NAS & Edge Deployment](docs/NAS-DEPLOYMENT.md)
- [Incident Response & Recovery](docs/RECOVERY.md)
- [Testing Strategy](docs/TESTING.md)

---

## License

MIT License. Copyright (c) 2026 Angelo Tejada.
