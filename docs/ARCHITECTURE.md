# Jules Supervisor — Architecture & System Design

## 1. System Overview

**Jules Supervisor** is an enterprise-grade, autonomous, policy-controlled AI orchestration platform that supervises Google Jules through the official Jules API.

```
+-----------------------------------------------------------------------------------+
|                                   Google Jules                                    |
+-----------------------------------------------------------------------------------+
                                          |
                                          | Official Jules API (REST / JSON)
                                          v
+-----------------------------------------------------------------------------------+
|                               packages/jules-client                               |
|  - Typed JulesAdapter (Zod runtime validated)                                     |
|  - Rate limiting, bounded jittered backoff, retry classification                  |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                                  apps/worker                                      |
|  - Session Watcher / Polling Sync / Distributed Locking                           |
|  - Ingestion & Event Normalization -> packages/core (Canonical Domain Events)     |
|  - Idempotency Gateway (DB unique constraints + redis lock)                       |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                            Context Builder (packages/ai)                          |
|  - Token budgeting & deterministic truncation                                     |
|  - Untrusted data tagging (Repo / Jules inputs treated as untrusted)              |
|  - Sensitive secret redaction & Context Digest hashing                            |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        AI Decision Engine (packages/ai)                           |
|  - Provider-agnostic abstraction (OmniRoute / OpenAI / Gemini / Claude)           |
|  - Strict Zod Schema validation (no arbitrary markdown/prose execution)           |
|  - Multi-model consensus support for high-risk domains                            |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                      Policy & Risk Engine (packages/policy)                       |
|  - Deterministic Safety Rules (Hard Veto overrides AI confidence)                 |
|  - Risk Classifier (LOW, MEDIUM, HIGH, CRITICAL)                                  |
|  - Loop Control (prevents infinite conversational or correction loops)            |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                           Execution Gate (apps/worker)                            |
|                                                                                   |
|  Mode: DISABLED     -> No observation or actions                                  |
|  Mode: DRY_RUN      -> Generate decisions, audit, DO NOT mutate Jules (DEFAULT)   |
|  Mode: ASSISTED     -> Route to Human Approval Queue                              |
|  Mode: AUTO_RESPOND -> Execute low-risk responses automatically                   |
|  Mode: FULL_AUTO    -> Execute policy-permitted actions & plan approvals          |
+-----------------------------------------------------------------------------------+
                       |                                          |
     [If Human Review Required]                          [If Auto-Approved]
                       v                                          v
+------------------------------------+          +-----------------------------------+
|            apps/web                |          |        Jules API Mutation         |
|  - Next.js Control Plane           |          |  - Re-verify session state first  |
|  - Human Review & Approval Queue   |          |  - Send response / Approve plan   |
|  - Real-time SSE Live Dashboard    |          |  - Reconcile ambiguous network    |
|  - Audit Log & Policy Manager      |          +-----------------------------------+
+------------------------------------+                            |
                                                                  v
                                                +-----------------------------------+
                                                |       Audit Trail & DB Record     |
                                                |  - packages/db (PostgreSQL)       |
                                                +-----------------------------------+
```

---

## 2. Core Modules & Boundaries

1. **`apps/web`**: Next.js 15 (App Router) + React 19 + Tailwind CSS + Lucide Icons.
   - Operations dashboard, real-time session monitoring via SSE.
   - Human approval interface with double-submit protection and stale-state verification.
   - Policy configuration, provider management, health metrics, and audit log.

2. **`apps/worker`**: Node.js background daemon.
   - Sync scheduler for session/activity polling with exponential backoff and jitter.
   - BullMQ queue consumers and distributed locking.
   - Pipeline executor: ingestion -> normalization -> context -> AI -> policy/risk -> gate -> action -> audit.

3. **`packages/core`**: Pure domain logic and models.
   - Canonical event definitions (`SESSION_CREATED`, `AGENT_MESSAGE`, `PLAN_CREATED`, etc.).
   - Execution modes (`DISABLED`, `DRY_RUN`, `ASSISTED`, `AUTO_RESPOND`, `FULL_AUTO`).
   - Risk levels (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) and domain state machines.
   - Loop detection algorithms and session cycle trackers.

4. **`packages/db`**: PostgreSQL persistence layer via Drizzle ORM.
   - Fully typed schemas, migrations, relations, indices, and transactional queries.
   - Entity models: `sessions`, `activities`, `decisions`, `approval_requests`, `policies`, `audit_events`, `sync_checkpoints`, `provider_configs`.

5. **`packages/jules-client`**: Official Google Jules API client adapter.
   - HTTP transport with runtime Zod response validation.
   - Configurable timeout, abort signals, rate limiting, and transient error retries.
   - Complete fixture set and mock adapter for local testing and contract verification.

6. **`packages/ai`**: AI decision subsystem.
   - OpenAI-compatible and OmniRoute provider adapters.
   - Structured output enforcement using Zod schemas (`DecisionResult`).
   - Deterministic context builder with sensitive secret redaction and token budgets.
   - Prompt injection defense boundary.

7. **`packages/policy`**: Deterministic Policy and Risk evaluation engine.
   - Rule-based safety evaluations independent of LLM output.
   - Hard veto triggers for security-critical paths (e.g. auth bypass, credential leakage, destructive migrations).
   - Risk scoring based on file paths, operation types, and pattern analysis.

8. **`packages/observability`**: Structured logging (Pino) & telemetry.
   - Correlation IDs (`requestId`, `sessionId`, `activityId`, `decisionId`).
   - Metrics counters and latency histograms for Jules API, AI latency, decision risk distribution.

9. **`packages/config`**: Environment and runtime configuration.
   - Zod-based strict configuration schema with fail-fast startup.

10. **`packages/shared`**: Cross-cutting utilities.
    - Hashing, crypto helpers, deterministic redaction, sleep with abort signals.

11. **`packages/test-utils`**: Test harnesses, mocks, and failure-injection utilities.
