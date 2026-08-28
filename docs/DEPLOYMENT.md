# Deployment Guide

## 1. Quickstart via Docker Compose

```bash
# 1. Clone repository
git clone https://github.com/angelotejada/Jules-Supervisor.git
cd Jules-Supervisor

# 2. Configure environment
cp .env.example .env
# Edit .env with your Google Jules API key and AI Provider endpoint / OmniRoute key

# 3. Start full stack (PostgreSQL, Redis, Web Control Plane, Worker Daemon)
docker compose up -d

# 4. Access Control Plane Dashboard
open http://localhost:3000
```

---

## 2. Local Development Setup

```bash
# Install dependencies
pnpm install

# Run all tests
npx vitest run

# Run TypeScript compile & typecheck
npx tsc --build

# Run Next.js control plane in development
pnpm --filter @jules/web dev

# Run Worker daemon in development
pnpm --filter @jules/worker dev
```

---

## 3. Production Environment Variables

Refer to `.env.example` for all required configurations and default parameters.
All secret-bearing keys (`JULES_API_KEY`, `AI_API_KEY`, `SESSION_SECRET`) are server-only.
