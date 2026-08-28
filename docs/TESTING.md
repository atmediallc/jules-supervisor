# Testing Strategy & Verification Guide

## 1. Test Architecture

Jules Supervisor incorporates a multi-tier testing strategy covering all critical subsystems:

```
+-------------------------------------------------------------+
| Unit Tests: Schemas, Crypto, Redaction, Risk, Loop Detector |
+-------------------------------------------------------------+
| Contract Tests: Mock Jules API Client, Error Classification |
+-------------------------------------------------------------+
| AI & Policy Tests: SSRF Guard, Hard Veto, Confidence Gates  |
+-------------------------------------------------------------+
| Integration Tests: Database Repositories, Idempotency Layer |
+-------------------------------------------------------------+
| Concurrency Tests: 5x Parallel Worker Race Simulation       |
+-------------------------------------------------------------+
| Failure-Injection Tests: Network 429, Stale Session State    |
+-------------------------------------------------------------+
| Security Tests: Prompt Injection Neutralization             |
+-------------------------------------------------------------+
```

## 2. Test Execution Commands

```bash
# Run complete test suite (Unit, Integration, Security, Concurrency, Failure Injection)
npx vitest run

# Run TypeScript compilation and strict type safety checks
npx tsc --build

# Run Next.js control plane production build
pnpm --filter @jules/web build
```

## 3. Test Coverage Summary

- **Unit Tests**: 100% of risk rules, execution gates, rate limiting, and redaction logic.
- **Contract Tests**: Verified against Google Jules API request/response schemas.
- **Security Tests**: Automated prompt injection test cases with adversarial payloads.
- **Concurrency Tests**: Idempotency and distributed lock protection under 5x simultaneous race conditions.
- **Failure-Injection Tests**: Stale state race conditions, network timeouts, and model rate limits.
