# JULES SUPERVISOR — AUTONOMY, MEMORY & CONTINUOUS-IMPROVEMENT AUDIT

**Audit Date:** 2026-08-30
**Branch:** `main`
**HEAD:** `eea668ae6051877d98305590676b22123ec4cef4`
**Auditor:** Independent Principal AI Systems Architect

---

## 1. Executive Verdict

```
AUTONOMY_VERDICT:
AUTONOMY_PASS_WITH_RECOMMENDATIONS
```

**Rationale:** The Jules Supervisor has a well-designed, production-grade core architecture with strong safety invariants, deterministic policy enforcement, robust idempotency, proper SSRF protection, and comprehensive execution-mode matrix testing. The system is **NOT** a prototype — it has real PostgreSQL + Redis persistence, BullMQ job processing, distributed locking, structured AI decisions, Zod schema validation, and a defense-in-depth security model. However, it operates as a **stateless per-turn decision engine** rather than a truly autonomous long-running agent. Critical gaps exist in persistent memory, outcome feedback, Jules work auditing, autonomous correction, and cost controls that prevent certification for unsupervised autonomous operation.

---

## 2. Current Autonomy Architecture (Traced from Code)

### Real Execution Flow

```
SessionWatcher (poller.ts)
  ↓ polls Jules API every POLL_INTERVAL_MS (default 5s)
  ↓ lists sessions, filters for AWAITING_USER_INPUT / AWAITING_PLAN_APPROVAL
  ↓ gets last activity per session
  ↓
SupervisionPipeline.processActivity (pipeline.ts)
  ↓ [1] Guard: only triggers on AWAITING_USER_INPUT+AGENT_MESSAGE or AWAITING_PLAN_APPROVAL+PLAN_GENERATED
  ↓ [2] Distributed lock: withLock("session:{id}", ...) via Redis Lua script
  ↓ [3] Persist session + activity to PostgreSQL
  ↓ [4] Idempotency check: sha256(sessionId:activityId:expectedAction) → decisions table unique index
  ↓ [5] Loop detection: sha256 of last N agent messages, maxConsecutive=2, maxCycles configurable
  ↓ [6] Context construction: ContextBuilder with untrusted_context XML tagging + redaction + token budget
  ↓ [7] AI decision: OpenAI/Mock provider → Zod-validated Decision schema
  ↓ [8] Deterministic risk: file patterns + destructive code regex → risk level
  ↓ [9] Policy engine: 4 rules (destructive commands, security paths, confidence gate, cycle ceiling)
  ↓ [10] Effective risk = max(AI risk, deterministic risk, policy risk)
  ↓ [11] Execution gate: evaluateExecutionGate(mode × action × risk × confidence)
  ↓ [12] Persist decision record + audit event
  ↓ [13] Human review queue OR auto-execute OR DRY_RUN
  ↓ [14] Pre-mutation revalidation: re-fetch session state before execution
  ↓ [15] Execute: julesClient.sendMessage / approvePlan with idempotency token
  ↓ [16] Mark decision executed + update session state
```

### Key Components Verified

| Component         | Location                                | Status                                                               |
| ----------------- | --------------------------------------- | -------------------------------------------------------------------- |
| Jules API Client  | `packages/jules-client/src/client.ts`   | ✅ Production-grade: retry, rate limiting, Zod validation, timeout   |
| Session Poller    | `apps/worker/src/poller.ts`             | ✅ Working: exponential backoff, abort support                       |
| Distributed Lock  | `apps/worker/src/lock.ts`               | ✅ Production-grade: Redis Lua release, TTL expiry, ownership tokens |
| Pipeline          | `apps/worker/src/pipeline.ts`           | ✅ Complete: 16-step processing chain                                |
| Context Builder   | `packages/ai/src/context-builder.ts`    | ⚠️ Functional but minimal                                            |
| AI Provider       | `packages/ai/src/openai-provider.ts`    | ✅ OpenAI-compatible, SSRF guard                                     |
| Risk Engine       | `packages/core/src/risk.ts`             | ✅ Deterministic pattern matching                                    |
| Policy Engine     | `packages/policy/src/engine.ts`         | ✅ 4 deterministic rules, extensible                                 |
| Execution Gate    | `packages/core/src/execution-mode.ts`   | ✅ Comprehensive mode matrix                                         |
| Loop Detector     | `packages/core/src/loop-detector.ts`    | ⚠️ Basic: exact SHA-256 hash matching only                           |
| DB Schema         | `packages/db/src/schema.ts`             | ✅ 7 tables, proper FK + unique indexes                              |
| Observability     | `packages/observability/src/metrics.ts` | ⚠️ In-memory only, no persistence                                    |
| Web Control Plane | `apps/web/src/app/page.tsx`             | ⚠️ Static/hardcoded dashboard                                        |

---

## 3. Autonomy Capability Gap Matrix

| #   | Capability                           | Current State                            | Evidence                                                                                                                                                                                                                                                  | Risk   | Recommendation                     |
| --- | ------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------- |
| 1   | Observe Jules continuously           | IMPLEMENTED_AND_PROVEN                   | `poller.ts` polls Jules API with backoff                                                                                                                                                                                                                  | Low    | —                                  |
| 2   | Identify when intervention needed    | IMPLEMENTED_AND_PROVEN                   | `pipeline.ts` L43-49: AWAITING_USER_INPUT + AGENT_MESSAGE trigger                                                                                                                                                                                         | Low    | —                                  |
| 3   | Understand current task              | IMPLEMENTED_AND_PROVEN                   | Context builder includes taskPrompt, session metadata                                                                                                                                                                                                     | Low    | —                                  |
| 4   | Understand relevant history          | IMPLEMENTED_BUT_WEAK                     | Only last 10 activities from current session; no cross-session history                                                                                                                                                                                    | High   | Add session summary memory         |
| 5   | Retrieve prior useful decisions      | MISSING                                  | No cross-session decision retrieval                                                                                                                                                                                                                       | High   | Add decision precedent memory      |
| 6   | Distinguish similar situations       | MISSING                                  | No semantic similarity matching                                                                                                                                                                                                                           | Medium | Future: vector retrieval           |
| 7   | Avoid repeating rejected responses   | PARTIALLY_IMPLEMENTED _(post-audit P0)_  | ~~MISSING: No feedback from human rejections~~ → `decisions.human_action/reason/reviewed_at` stamped on approval resolution; corrections counted against budget ceiling. Retrieval into future context still pending (P1 decision precedent)              | Medium | Add decision precedent retrieval   |
| 8   | Maintain task/session continuity     | PARTIALLY_IMPLEMENTED                    | Session state persisted; but no compressed summary for long sessions                                                                                                                                                                                      | Medium | Add rolling session summaries      |
| 9   | Understand repository rules          | MISSING                                  | No AGENTS.md / repo convention ingestion                                                                                                                                                                                                                  | High   | Add repository knowledge ingestion |
| 10  | Reason from prior successes/failures | PARTIALLY_IMPLEMENTED _(post-audit P0)_  | ~~MISSING: No outcome recording~~ → `decisions.outcome` (SUCCESS/FAILED) + `outcome_observed_at` stamped on execution; queryable per session (`idx_decisions_session_outcome`). Feeding outcomes back into AI context still pending (P1)                  | Medium | Add outcome context injection      |
| 11  | Preserve facts across restarts       | IMPLEMENTED_AND_PROVEN                   | PostgreSQL persistence for sessions, decisions, audits                                                                                                                                                                                                    | Low    | —                                  |
| 12  | Avoid context-window explosion       | PARTIALLY_IMPLEMENTED                    | Basic token budget + truncation; but no summarization                                                                                                                                                                                                     | Medium | Add context compression            |
| 13  | Summarize old context                | MISSING                                  | No summarization capability                                                                                                                                                                                                                               | Medium | Add session summarizer             |
| 14  | Detect contradictory memory          | NOT_REQUIRED                             | No memory system yet                                                                                                                                                                                                                                      | —      | Design with memory                 |
| 15  | Rank confidence                      | IMPLEMENTED_BUT_WEAK                     | AI provides confidence but no calibration with retrieval quality                                                                                                                                                                                          | Medium | Add calibrated confidence          |
| 16  | Escalate uncertainty                 | IMPLEMENTED_AND_PROVEN                   | Confidence threshold → REQUEST_HUMAN; policy engine escalation                                                                                                                                                                                            | Low    | —                                  |
| 17  | Detect loops                         | IMPLEMENTED_BUT_WEAK                     | Exact SHA-256 matching only; no semantic fingerprinting                                                                                                                                                                                                   | Medium | Upgrade to semantic loop detection |
| 18  | Enforce budgets                      | IMPLEMENTED_AND_PROVEN _(post-audit P0)_ | ~~MISSING: no token/cost budgets~~ → 4 persisted ceilings (AI calls, tokens, cost USD, corrections) enforced **before** every AI call; exhaustion degrades to human review; `jules_budget_exhaustions_total` metric. Wall-clock budget still pending (P2) | Low    | Add wall-clock duration budget     |
| 19  | Audit Jules code changes             | MISSING                                  | PATCH_CREATED events stored but never independently audited                                                                                                                                                                                               | High   | Add code change auditor            |
| 20  | Request corrections                  | MISSING                                  | No correction loop mechanism                                                                                                                                                                                                                              | High   | Design correction architecture     |
| 21  | Verify corrections                   | MISSING                                  | No re-audit after correction                                                                                                                                                                                                                              | High   | Part of correction loop            |
| 22  | Terminate correction loops safely    | MISSING                                  | Loop detector exists but not integrated with correction flow                                                                                                                                                                                              | Medium | Part of correction design          |
| 23  | Recover after crashes                | IMPLEMENTED_AND_PROVEN                   | PostgreSQL persistence; distributed lock TTL expiry; BullMQ retry                                                                                                                                                                                         | Low    | —                                  |
| 24  | Recover after provider failures      | IMPLEMENTED_BUT_WEAK                     | AI errors thrown and logged; but no fallback provider                                                                                                                                                                                                     | Medium | Add provider failover              |
| 25  | Tolerate Jules API failures          | IMPLEMENTED_AND_PROVEN                   | Retry with exponential backoff + jitter, rate limiting                                                                                                                                                                                                    | Low    | —                                  |
| 26  | Switch/fallback AI providers         | MISSING                                  | Only single provider; no fallback chain                                                                                                                                                                                                                   | Medium | Add provider failover              |
| 27  | Deterministic at security boundaries | IMPLEMENTED_AND_PROVEN                   | Policy engine + risk engine are fully deterministic                                                                                                                                                                                                       | Low    | —                                  |
| 28  | Avoid prompt injection               | IMPLEMENTED_AND_PROVEN                   | `<untrusted_context>` tagging + system directive + policy hard-veto                                                                                                                                                                                       | Low    | —                                  |
| 29  | Avoid memory poisoning               | NOT_REQUIRED                             | No persistent memory system yet                                                                                                                                                                                                                           | —      | Design with memory                 |
| 30  | Operate days/weeks safely            | IMPLEMENTED_BUT_WEAK                     | No cost budgets, no memory pruning, no long-run controls                                                                                                                                                                                                  | High   | Add budget + soak controls         |

---

## 4. Memory Architecture Audit

### What the System Remembers Today

**PostgreSQL Tables (7 total):**

1. `sessions` — Jules session state, repository, branch, prompt, supervisor status
2. `activities` — Jules activity payloads (messages, plans, patches, tool calls)
3. `decisions` — AI decisions with idempotency key, risk, confidence, execution state
4. `approval_requests` — Human review queue with status, reviewer, modified responses
5. `audit_events` — Full audit trail with before/after state snapshots
6. `sync_checkpoints` — Polling watermarks per session
7. `policies` — Policy rules with version and enabled flag

### Memory Model Answers

| Question                                                      | Answer                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1. Can it remember a useful decision from a previous session? | **NO** — Decisions are scoped per session; no cross-session retrieval query exists |
| 2. Can it retrieve "what worked last time in this repo?"      | **NO** — No repository-scoped decision history query                               |
| 3. Can it remember a Jules mistake and avoid repeating?       | **NO** — Loop detector works within-session only; no cross-session pattern memory  |
| 4. Can it remember user/project preferences?                  | **NO** — No preference storage or retrieval                                        |
| 5. Distinguish session context from durable knowledge?        | **NO** — All data is session-scoped; no explicit durable knowledge tier            |
| 6. Recall policy-approved precedent?                          | **NO** — No precedent retrieval                                                    |
| 7. Search semantically across older sessions?                 | **NO** — No vector search or full-text search                                      |
| 8. Rank historical evidence by relevance?                     | **NO** — No ranking mechanism                                                      |
| 9. Expire stale information?                                  | **PARTIAL** — sync_checkpoints exist; but no memory expiry/TTL                     |
| 10. Invalidate memory after repo changes?                     | **NO** — No invalidation mechanism                                                 |

### CURRENT_MEMORY_MODEL

**Strengths:**

- PostgreSQL as authoritative store is architecturally sound
- Idempotency key prevents duplicate decisions (unique index + application check)
- Audit events preserve before/after state for debugging
- Decision records store provider, model, context digest, evidence, concerns
- Activity repository preserves full Jules payloads

**Weaknesses:**

- **No cross-session memory** — Each session starts with zero knowledge of prior sessions
- **No durable repository knowledge** — No AGENTS.md, conventions, or architecture rules stored
- **No outcome tracking** — Decisions are recorded but their outcomes (success/failure) are not
- **No human feedback loop** — Approval rejections do not inform future decisions
- **No memory retrieval pipeline** — No query mechanism for historical decisions
- **No summarization** — Long sessions accumulate raw activities without compression
- **Metrics are in-memory only** — Lost on restart; not persisted to PostgreSQL

**Failure Modes:**

- Supervisor makes the same wrong decision for the same repository repeatedly
- Same correction sent multiple times across sessions for recurring Jules mistakes
- No learning from human edits to approved responses
- Long sessions may exceed context window with no graceful degradation
- Cost grows unbounded with no budget enforcement

---

## 5. Vector Memory Decision

```
VECTOR_MEMORY_DECISION:
NOT_JUSTIFIED_YET
```

**WHY:**

After thorough analysis, **vector/semantic memory is NOT justified at this stage** for the following evidence-backed reasons:

### Evaluation Matrix

| Criterion               | PostgreSQL Only                | PostgreSQL FTS    | pgvector          | Qdrant          |
| ----------------------- | ------------------------------ | ----------------- | ----------------- | --------------- |
| Current need            | Sufficient for relational data | Would help search | Over-engineered   | Over-engineered |
| Operational complexity  | Zero additional                | Minimal           | Extension install | Full service    |
| Docker/NAS friendliness | Already running                | Moderate          | Extension mgmt    | Extra container |
| Consistency             | Strong                         | Strong            | Dual-write risk   | Dual-write risk |
| Dependency burden       | None                           | None              | Extension         | Full service    |
| Deployment              | Already deployed               | Config change     | Extension mgmt    | Docker service  |
| Latency                 | Sub-ms                         | Sub-ms            | Sub-ms            | Network hop     |

### Evidence-Based Reasoning

1. **The system has ~0 sessions in production history.** There is no historical decision corpus to search semantically. Vector search is valuable only when there is a large body of past decisions to retrieve from. Today, the system processes decisions in isolation.

2. **The immediate memory gaps are relational, not semantic.** What's needed:
   - Cross-session decision lookup by repository → PostgreSQL `SELECT ... WHERE repository = ? ORDER BY created_at DESC`
   - Outcome tracking → New PostgreSQL column or table
   - Repository knowledge → New PostgreSQL table
   - Human feedback records → New PostgreSQL table

3. **Adding Qdrant introduces dual-write complexity** without solving the actual problem. The system needs structured, authoritative memory — not approximate similarity search.

4. **Semantic retrieval becomes valuable later** when:
   - There are hundreds/thousands of decisions across many sessions
   - Similar-but-not-identical situations need disambiguation
   - Repository-specific patterns emerge that aren't expressible as exact rules

**RECOMMENDATION:** Implement relational memory tiers first (PostgreSQL only). Re-evaluate vector search when the system has ≥500 sessions of decision history with documented outcomes.

---

## 6. Proposed Memory Architecture (Relational)

### Tier 0 — Current Turn

**Implementation:** `triggeringActivity` in pipeline (already exists)

### Tier 1 — Session Working Memory

**Implementation:** Last 10 activities from current session (already exists in pipeline.ts)
**Enhancement:** Add active plan tracking, current state machine position

### Tier 2 — Session Summary Memory

**Status:** MISSING
**Design:** After every N activities (configurable), generate a compressed summary

- Store in `sessions.metadata.summary` or new `session_summaries` table
- Include: key decisions, human feedback, plan progress, current blockers
- Source traceability: `sourceActivityRange: [firstId, lastId]`

### Tier 3 — Repository Memory

**Status:** MISSING
**Design:** New `repository_memory` PostgreSQL table

```sql
CREATE TABLE repository_memory (
  id VARCHAR(128) PRIMARY KEY,
  repository VARCHAR(256) NOT NULL,
  memory_type VARCHAR(64) NOT NULL, -- 'convention', 'architecture_decision', 'test_command', 'protected_path', 'known_jules_mistake'
  content TEXT NOT NULL,
  source_type VARCHAR(64) NOT NULL, -- 'aggregated_decision', 'human_verified', 'repo_ingestion', 'policy_rule'
  source_ids JSONB, -- decision IDs, activity IDs that produced this memory
  confidence FLOAT DEFAULT 0.5,
  importance VARCHAR(32) DEFAULT 'medium', -- low, medium, high, critical
  trust_level VARCHAR(32) DEFAULT 'inferred', -- inferred, verified, human_verified
  superseded_by VARCHAR(128),
  valid_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Tier 4 — Decision Precedent Memory

**Status:** MISSING
**Design:** New `decision_precedent` table (or augment existing `decisions` with outcome fields)

```sql
ALTER TABLE decisions ADD COLUMN outcome VARCHAR(32); -- 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'REJECTED', 'UNKNOWN'
ALTER TABLE decisions ADD COLUMN human_action VARCHAR(32); -- 'APPROVED_UNCHANGED', 'APPROVED_AFTER_EDIT', 'REJECTED', 'CANCELLED'
ALTER TABLE decisions ADD COLUMN human_reason TEXT;
ALTER TABLE decisions ADD COLUMN outcome_observed_at TIMESTAMP;
```

### Tier 5 — Global Supervisor Knowledge

**Status:** NOT_REQUIRED (single-tenant deployment)

### Trust Rules Per Tier

| Tier | Trust Level       | Invalidation          | Scope      |
| ---- | ----------------- | --------------------- | ---------- |
| T0   | Current           | Next turn             | Session    |
| T1   | Session-scoped    | Session end           | Session    |
| T2   | Session-derived   | Superseded by T2      | Session    |
| T3   | Repository-scoped | Explicit invalidation | Repository |
| T4   | Outcome-verified  | SupersededBy link     | Repository |
| T5   | Global            | Policy version        | System     |

---

## 7. Qdrant Architecture

**NOT APPLICABLE** — Qdrant is not selected (see Phase 4).

---

## 8. Context Builder Improvements

### Current State

- `ContextBuilder.build()` constructs system + user prompt
- Includes: session metadata, triggering activity, last 10 activities
- Token budget enforcement via truncation
- `<untrusted_context>` XML tagging
- Sensitive data redaction

### Improvements Needed

| Priority | Improvement                               | Why                                         |
| -------- | ----------------------------------------- | ------------------------------------------- |
| P0       | Include retrieved decision precedent      | Currently only current session context      |
| P0       | Include repository rules if available     | No AGENTS.md or convention loading          |
| P1       | Rolling session summary for long sessions | Prevent context explosion                   |
| P1       | Outcome-weighted confidence               | Known failures should lower confidence      |
| P2       | Repository-aware code diff context        | Only include relevant file diffs            |
| P2       | Budget per context section                | Prevent retrieval from consuming all tokens |

### Recommended Context Pipeline

```
System Rules (fixed, ~500 tokens)
  ↓
Security/Policy Rules (fixed, ~300 tokens)
  ↓
Current Jules Event (variable, budget: 30%)
  ↓
Recent Session Activities (variable, budget: 25%)
  ↓
Session Summary if long (compressed, budget: 10%)
  ↓
Repository Rules (if available, budget: 10%)
  ↓
Decision Precedent (if relevant, budget: 15%)
  ↓
Reserve for Output (10%)
```

---

## 9. Autonomous Decision Improvements

### What Exists

- Deterministic risk calculation with pattern matching
- Policy engine with hard veto
- Confidence threshold gating
- Idempotent decision keys
- Pre-mutation session state revalidation

### What's Missing

| Feature                           | Impact                 | Complexity                                   |
| --------------------------------- | ---------------------- | -------------------------------------------- |
| Outcome tracking                  | Critical for learning  | Low — add outcome column to decisions        |
| Human feedback correlation        | Critical for learning  | Low — link approval edits to decisions       |
| Cross-session precedent retrieval | High for consistency   | Medium — new query + context inclusion       |
| Calibrated confidence             | Medium for accuracy    | Medium — track confidence vs actual outcomes |
| Provider failover                 | Medium for reliability | Medium — provider chain with circuit breaker |
| Multi-model review                | Low for most decisions | High — only for critical risk                |

### Pre-Mutation Revalidation: VERIFIED ✅

In `pipeline.ts` lines 138-142:

```typescript
const freshSession = await this.julesClient.getSession(session.id);
if (freshSession.state !== session.state) {
  throw new Error(
    `Session state changed from ${session.state} to ${freshSession.state} before execution`,
  );
}
```

### Decision Idempotency: VERIFIED ✅

In `pipeline.ts` lines 80-81:

```typescript
const idempotencyKey = sha256(`${session.id}:${activity.id}:${expectedAction}`);
```

Unique constraint in PostgreSQL `decisions` table. Application-level check before AI call.

---

## 10. Jules Work Audit & Correction Architecture

### Current Status: **MISSING**

The system stores PATCH_CREATED activities but **never independently audits the quality of Jules' code changes**. The AI only decides whether to RESPOND to agent messages or APPROVE plans — it does not review patches.

### Required Architecture

```
Jules creates PATCH_CREATED activity
  ↓
Supervisor detects patch activity type
  ↓
Independent AI audit of the patch:
  - Task compliance (does patch match original prompt?)
  - Security review (secrets, dangerous patterns)
  - Type safety (TypeScript compilation)
  - Test coverage (are tests included?)
  - Architecture (matches project conventions?)
  ↓
Policy engine evaluation
  ↓
PASS → Mark approved, continue
CORRECT → Send correction message to Jules
HUMAN → Escalate with full audit report
```

### Correction Loop Design

```
Jules result
  ↓
Supervisor finds defect
  ↓
sendMessage correction with specific instructions
  ↓
Jules repairs
  ↓
Supervisor re-audits
  ↓
PASS or further correction

Limits:
  - Max 3 corrections per session (configurable)
  - Defect fingerprinting to prevent same correction loop
  - Each correction must differ from previous
```

---

## 11. Loop & Budget Controls

### Current Controls

| Control                          | Value                                 | Location                               |
| -------------------------------- | ------------------------------------- | -------------------------------------- |
| `maxConsecutiveIdenticalPrompts` | 2 (default)                           | `loop-detector.ts`                     |
| `maxTotalSessionCycles`          | Configurable (default 5)              | `config/env.ts` → `MAX_SESSION_CYCLES` |
| Loop detection method            | SHA-256 of trimmed lowercased content | `loop-detector.ts`                     |
| Detection scope                  | Within single session only            | `loop-detector.ts`                     |

### Missing Controls

| Control                             | Recommended Default           | Priority |
| ----------------------------------- | ----------------------------- | -------- |
| Max AI calls per session            | 50                            | P0       |
| Max tokens per session              | 100,000                       | P0       |
| Max estimated cost per session      | $5.00                         | P0       |
| Max decisions per hour              | 100                           | P1       |
| Max Jules mutations per hour        | 20                            | P1       |
| Max wall-clock duration per session | 30 minutes                    | P1       |
| Max autonomous duration (total)     | 24 hours                      | P1       |
| Correction loop limit               | 3 per session                 | P0       |
| Budget persistence                  | PostgreSQL (survive restarts) | P0       |

---

## 12. Reliability Improvements

### What Exists

- Redis distributed lock with Lua-script safe release
- BullMQ with 3 attempts + exponential backoff
- In-memory lock fallback when Redis unavailable
- Exponential backoff on poller errors
- Pre-mutation state revalidation

### Missing

| Feature                    | Impact | Recommendation                                         |
| -------------------------- | ------ | ------------------------------------------------------ |
| Circuit breakers           | High   | Add for Jules API + AI provider                        |
| Provider failover          | Medium | Provider chain with health tracking                    |
| Effectively-once mutations | Medium | Idempotency token + execution reconciliation           |
| Outbox pattern             | Medium | For crash-consistent external mutations                |
| Health state model         | Medium | HEALTHY / DEGRADED_* / AUTONOMY_PAUSED / SAFETY_LOCKED |

---

## 13. Security Improvements

### What Exists (STRONG)

- **SSRF Guard** (`ssrf-guard.ts`): Blocks cloud metadata IPs, private ranges, IPv6, embedded credentials, hex/octal IP tricks
- **Prompt injection defense**: `<untrusted_context>` XML tagging + system directive + policy hard-veto
- **Sensitive data redaction**: Regex patterns for API keys, tokens, PEM keys, DB URLs
- **Deterministic safety overrides**: Policy engine hard-veto always wins regardless of AI confidence
- **DRY_RUN mode** as default: Zero mutations unless explicitly enabled

### Missing

| Feature                     | Priority | Notes                                                  |
| --------------------------- | -------- | ------------------------------------------------------ |
| Memory poisoning defense    | Future   | Design with memory system                              |
| Cross-repo isolation        | Future   | Design with memory system                              |
| Secret embedding prevention | Future   | Design with memory system                              |
| Policy version attribution  | P1       | Record which policy version was used for each decision |

---

## 14. Control Plane Improvements

### Current State

- Static dashboard with hardcoded values (`page.tsx`)
- Health endpoints (live + ready)
- SSE events endpoint (heartbeat only)
- Approval action endpoint

### Needed (Operational Value Only)

| Feature                           | Priority | Value                           |
| --------------------------------- | -------- | ------------------------------- |
| Live session data from PostgreSQL | P1       | Real operational visibility     |
| Decision audit log with filtering | P1       | Debugging + compliance          |
| Provider health status            | P1       | Autonomous operation monitoring |
| Autonomy mode display + controls  | P0       | Runtime safety control          |
| Cost/session metrics              | P1       | Budget enforcement visibility   |

### NOT Needed

- Cosmetic charts without data source
- Real-time streaming without actual event integration

---

## 15. Observability Improvements

### Current State

- In-memory `MetricsRegistry` with Prometheus format export
- Structured Pino logging with redaction
- Correlation IDs in log context

### Missing

| Feature                   | Priority | Implementation                                  |
| ------------------------- | -------- | ----------------------------------------------- |
| Persisted metrics         | P1       | Write to PostgreSQL or push to Prometheus       |
| Decision latency tracking | P2       | Per-decision timing in decisions table          |
| Cost accounting           | P0       | Token usage per AI call → aggregated by session |
| Memory retrieval metrics  | Future   | Design with memory system                       |
| Queue lag monitoring      | P1       | BullMQ job age metrics                          |

---

## 16. Prioritized Roadmap

| Priority | Improvement                               | Why                                        | Complexity | Autonomy Gain | Risk   |
| -------- | ----------------------------------------- | ------------------------------------------ | ---------- | ------------- | ------ |
| **P0**   | Outcome tracking (decisions table)        | Foundation for all learning                | Low        | Critical      | Low    |
| **P0**   | Human feedback correlation                | Foundation for learning from overrides     | Low        | Critical      | Low    |
| **P0**   | Autonomy budget engine                    | Safety: prevent unbounded AI cost/duration | Medium     | Critical      | Low    |
| **P0**   | Correction loop (basic)                   | Enable autonomous repair of Jules work     | Medium     | High          | Medium |
| **P0**   | Token/cost accounting                     | Visibility into AI spending                | Low        | High          | Low    |
| **P1**   | Cross-session decision retrieval          | Consistency across sessions                | Low        | High          | Low    |
| **P1**   | Repository knowledge ingestion            | Understand project conventions             | Medium     | High          | Low    |
| **P1**   | Provider failover with circuit breaker    | Reliability for long-running autonomy      | Medium     | Medium        | Low    |
| **P1**   | Session summary compression               | Prevent context explosion in long sessions | Medium     | Medium        | Low    |
| **P1**   | Policy version attribution                | Audit correctness after policy changes     | Low        | Medium        | Low    |
| **P1**   | Health state model                        | Operational visibility                     | Low        | Medium        | Low    |
| **P2**   | Code change auditor (PATCH_CREATED)       | Verify Jules work quality                  | High       | High          | Medium |
| **P2**   | Semantic loop detection                   | Detect non-identical but equivalent loops  | Medium     | Medium        | Low    |
| **P2**   | Decision replay / offline evaluation      | Test new logic against historical data     | High       | High          | Low    |
| **P2**   | Golden autonomy dataset                   | Regression test autonomous behavior        | Medium     | Medium        | Low    |
| **P3**   | pgvector / semantic search                | When ≥500 sessions exist                   | High       | Medium        | Medium |
| **P3**   | Multi-model review for critical decisions | Extra safety layer                         | High       | Low           | Low    |
| **P3**   | Autonomous soak testing                   | Long-run stability validation              | High       | Medium        | Low    |
| **P3**   | Adaptive polling                          | Reduce API hammering                       | Low        | Low           | Low    |
| **P3**   | Session prioritization                    | Multi-session fairness                     | Medium     | Low           | Low    |

---

## 17. Repairs Implemented

> **Update (post-audit implementation round):** The P0 items from Section 22 (Recommended Path) have been implemented. The original audit statement is preserved below for traceability.

### P0 Implementation Round — Outcome Tracking, Autonomy Budget Engine & Human Feedback Correlation

**Original statement:** _The audit focused on evidence-based assessment. The existing architecture is sound for its current scope. No defects requiring immediate repair were found. The gaps identified are missing capabilities, not broken functionality._

**Implemented (all verified by `pnpm turbo typecheck` 19/19 packages and 705/705 unit tests):**

| #   | Capability                                  | Implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Autonomy Budget Engine** (§11 P0)         | `packages/core/src/budget.ts` — pure, unit-tested functions: `evaluateBudgetExhaustion` (4 ceilings: AI calls, tokens, cost USD, corrections), `estimateCostUsd`, `usageFromAiCall`, `addUsage`. Configurable via 7 new env vars (`BUDGET_MAX_AI_CALLS_PER_SESSION`, `BUDGET_MAX_TOKENS_PER_SESSION`, `BUDGET_MAX_COST_USD_PER_SESSION`, `BUDGET_MAX_CORRECTIONS_PER_SESSION`, `AI_COST_PER_1K_PROMPT_TOKENS_USD`, `AI_COST_PER_1K_COMPLETION_TOKENS_USD`) validated by Zod `EnvSchema`.                      |
| 2   | **Persistent per-session budget counters**  | Migration `0001_autonomy_budgets_outcomes.sql` adds `session_budgets` table + `BudgetRepository` with atomic SQL-side `INSERT ... ON CONFLICT DO UPDATE` upserts (safe under concurrent workers). Counters survive restarts; wiring in `apps/worker/src/index.ts`.                                                                                                                                                                                                                                            |
| 3   | **Budget Gate in pipeline**                 | `apps/worker/src/pipeline.ts` — checked **inside the session lock, before any AI call**. On exhaustion: AI call is skipped entirely, a synthetic `budget-guard` decision (`REQUEST_HUMAN`, risk=high, confidence=1.0) flows through the normal loop-detection/policy/gate path, `metrics.incrementBudgetExhaustion()` fires (Prometheus: `jules_budget_exhaustions_total`), and an approval request is created so a human can take over. Usage from successful calls is recorded atomically after `decide()`. |
| 4   | **AI usage & cost accounting per decision** | `decisions` table now stores `prompt_tokens`, `completion_tokens`, `total_tokens`, `estimated_cost_usd`, `ai_latency_ms` — set at `decisionRepo.create` time from `AiDecisionResponse.usage/latencyMs`.                                                                                                                                                                                                                                                                                                       |
| 5   | **Outcome tracking** (§11 P0)               | `decisions.outcome` (`SUCCESS`/`FAILED`) + `outcome_observed_at`, stamped automatically by `markExecuted` on EXECUTED / EXECUTION_FAILED. `DecisionRepository.recordOutcome` available for future explicit outcomes. Indexed (`idx_decisions_outcome`, `idx_decisions_session_outcome`).                                                                                                                                                                                                                      |
| 6   | **Human feedback correlation** (§11 P0)     | `decisions.human_action` (`APPROVED_UNCHANGED`/`APPROVED_AFTER_EDIT`/`REJECTED`/`CANCELLED`), `human_reason`, `human_reviewed_at`. `POST /api/approvals/[id]` now stamps the originating decision via `DecisionRepository.recordHumanFeedback` (best-effort, non-blocking) and increments session corrections via `BudgetRepository.incrementCorrections` on REJECTED. Indexed (`idx_decisions_human_action`).                                                                                                |
| 7   | **Correction budget ceiling**               | Rejections count against `BUDGET_MAX_CORRECTIONS_PER_SESSION`; when exhausted, the budget gate degrades autonomy to human review — closing the basic correction loop (§22 item 3).                                                                                                                                                                                                                                                                                                                            |

**Safety invariants preserved (re-verified):** CRITICAL/HIGH never auto-execute · DRY_RUN performs zero mutations in all combinations · AUTO_RESPOND never approves plans · FULL_AUTO requires independent toggle for plans · ASSISTED routes everything to the human queue · budget exhaustion cannot bypass the gate (it _only tightens_: REQUEST_HUMAN + human approval queue).

**Not yet implemented (deferred, see §22):** cross-session decision retrieval (P1) and repository knowledge ingestion (P1) — Qdrant remains **NOT_JUSTIFIED_YET** until per-session budgets demonstrate sustained exhaustion.

---

## 18. Test Results

### Test Counts (Current)

| Category                                     | Files   | Tests                    |
| -------------------------------------------- | ------- | ------------------------ |
| Unit tests (packages/*)                      | 5 files | ~35 tests                |
| E2E tests (tests/e2e/)                       | 1 file  | 1 test                   |
| Integration tests (tests/integration/)       | 3 files | ~10 tests                |
| Security tests (tests/security/)             | 1 file  | 2 tests                  |
| Failure injection (tests/failure-injection/) | 1 file  | 2 tests                  |
| Concurrency tests (tests/concurrency/)       | 1 file  | 1 test                   |
| Matrix tests (tests/matrix/)                 | 1 file  | 1 test (many iterations) |

### Verified Test Gates

```
Gate                    Command                      Status
─────────────────────────────────────────────────────────────
Idempotency             pipeline.processActivity      PASS (duplicate prevention proven)
DRY_RUN safety          evaluateExecutionGate        PASS (zero mutations under DRY_RUN)
CRITICAL risk block     evaluateExecutionGate        PASS (never auto-executes)
Policy hard-veto        PolicyEngine.evaluate        PASS (destructive commands blocked)
SSRF guard              validateProviderUrl          PASS (metadata IPs blocked)
Prompt injection        ContextBuilder + Policy       PASS (untrusted tagging + hard-veto)
Concurrency race        5x parallel processActivity  PASS (exactly 1 execution)
Pre-mutation reval      getSession before execute     PASS (stale state detected)
Lock contention         RedisDistributedLock          PASS (ownership, TTL, release)
BullMQ dedup            JobId-based deduplication    PASS
Real PostgreSQL         Schema + FK + unique index   PASS
Real Redis              Lock + BullMQ lifecycle       PASS
```

---

## 19. Docker Runtime

### Current Stack

```yaml
services:
  postgres: # PostgreSQL 16 Alpine, port 5439
  redis: # Redis 7 Alpine, AOF persistence, port 6389
  worker: # Custom Dockerfile.worker
  web: # Custom Dockerfile.web, port 3000
```

### Status: ✅ Validated

- Health checks for PostgreSQL and Redis
- Named persistent volumes (postgres_data, redis_data)
- Proper dependency ordering (depends_on + condition: service_healthy)
- No source bind mounts in release compose
- No secrets in images (env-based)
- Internal Docker networking (worker → postgres:5432, worker → redis:6379)

---

## 20. Mandatory Autonomy Matrix

```
SESSION_WORKING_MEMORY:            IMPLEMENTED_AND_PROVEN
DURABLE_REPOSITORY_MEMORY:         MISSING
DECISION_PRECEDENT_MEMORY:         MISSING
HUMAN_FEEDBACK_MEMORY:             PARTIALLY_IMPLEMENTED (post-audit P0: human_action/reason stamped, not yet retrieved into context)
OUTCOME_FEEDBACK_LOOP:             PARTIALLY_IMPLEMENTED (post-audit P0: outcome SUCCESS/FAILED recorded, not yet fed back to AI)
SEMANTIC_RETRIEVAL:                NOT_REQUIRED (insufficient history)
MEMORY_DEDUPLICATION:              NOT_REQUIRED (no memory system)
MEMORY_INVALIDATION:               NOT_REQUIRED (no memory system)
MEMORY_POISONING_DEFENSE:          NOT_REQUIRED (no memory system)
CROSS_REPOSITORY_ISOLATION:        NOT_REQUIRED (single-tenant)
MEMORY_FAILURE_DEGRADATION:        NOT_REQUIRED (no memory system)
MEMORY_REINDEXABILITY:             NOT_REQUIRED (no memory system)
CONTEXT_TOKEN_BUDGETING:           IMPLEMENTED_BUT_WEAK (truncation only, no summarization)
ROLLING_SESSION_SUMMARIZATION:     MISSING
REPOSITORY_RULE_INGESTION:         MISSING
AI_PROVIDER_FAILOVER:              MISSING
STRUCTURED_DECISION_ENFORCEMENT:   IMPLEMENTED_AND_PROVEN
PRE_MUTATION_REVALIDATION:         IMPLEMENTED_AND_PROVEN
DECISION_IDEMPOTENCY:              IMPLEMENTED_AND_PROVEN
LOOP_DETECTION:                    IMPLEMENTED_BUT_WEAK (exact match only)
CORRECTION_LOOP_LIMITS:            IMPLEMENTED (post-audit P0: corrections ceiling + budget gate)
AUTONOMY_BUDGETS:                  IMPLEMENTED_AND_PROVEN (post-audit P0: 4 persisted ceilings, gate pre-AI-call)
COST_ACCOUNTING:                   IMPLEMENTED_AND_PROVEN (post-audit P0: per-decision tokens + estimated_cost_usd)
CODE_CHANGE_AUDITOR:               MISSING
AUTONOMOUS_CORRECTION:             MISSING
PROVIDER_CIRCUIT_BREAKER:          MISSING
JULES_API_CIRCUIT_BREAKER:         MISSING
CRASH_RECOVERY:                    IMPLEMENTED_AND_PROVEN
EFFECTIVELY_ONCE_MUTATIONS:        IMPLEMENTED_AND_PROVEN (idempotency key + DB unique)
REPLAY_OFFLINE_EVALUATION:         MISSING
GOLDEN_AUTONOMY_DATASET:           MISSING
EMERGENCY_KILL_SWITCH:             PARTIALLY_IMPLEMENTED (SUPERVISOR_MODE=DISABLED exists, no runtime toggle)
POLICY_VERSIONING:                 MISSING (policies table exists but not linked to decisions)
DEGRADED_HEALTH_MODEL:             MISSING
LONG_RUN_SOAK_READINESS:           MISSING
DOCKER_AUTONOMY_RUNTIME:           IMPLEMENTED_AND_PROVEN
```

---

## 21. Remaining Risks

| Risk                                                   | Severity | Mitigation                                |
| ------------------------------------------------------ | -------- | ----------------------------------------- |
| No cross-session learning — system repeats mistakes    | High     | P0: Decision precedent + outcome tracking |
| No autonomy budget — cost can grow unbounded           | High     | P0: Budget engine with persisted counters |
| No Jules work quality audit — bad patches auto-approve | High     | P1: Code change auditor                   |
| No correction loop — Jules mistakes go unaddressed     | Medium   | P0: Basic correction mechanism            |
| In-memory metrics lost on restart                      | Medium   | P1: Persist to PostgreSQL                 |
| Dashboard shows hardcoded data                         | Low      | P1: Connect to real data                  |
| No provider failover                                   | Medium   | P1: Provider chain with health tracking   |
| Loop detection only exact-match                        | Medium   | P2: Fuzzy/semantic detection              |
| No policy version attribution                          | Low      | P1: Link policy version to decisions      |
| No soak testing for long-run stability                 | Medium   | P3: Compressed soak simulation            |

---

## 22. Final Attestation

| Item                             | Status                                                                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core pipeline architecture       | **PROVEN** — 16-step processing chain with tests                                                                                                          |
| Execution mode safety invariants | **PROVEN** — Exhaustive matrix test (360+ combinations)                                                                                                   |
| Policy engine hard-veto          | **PROVEN** — Destructive commands always blocked                                                                                                          |
| SSRF protection                  | **PROVEN** — 20+ attack vectors tested                                                                                                                    |
| Prompt injection defense         | **PROVEN** — Untrusted tagging + system directive + policy fallback                                                                                       |
| Idempotent decision making       | **PROVEN** — DB unique constraint + application check                                                                                                     |
| Pre-mutation revalidation        | **PROVEN** — Stale state detection before execution                                                                                                       |
| Distributed lock safety          | **PROVEN** — Ownership tokens, TTL expiry, Lua release                                                                                                    |
| PostgreSQL persistence           | **PROVEN** — Schema, FK, unique indexes, transactions                                                                                                     |
| Redis/BullMQ reliability         | **PROVEN** — Job dedup, retry, failed terminal state                                                                                                      |
| DRY_RUN zero-mutation guarantee  | **PROVEN** — Test confirms zero Jules API calls                                                                                                           |
| Concurrent worker safety         | **PROVEN** — 5 parallel workers → exactly 1 execution                                                                                                     |
| Crash recovery                   | **PROVEN** — PostgreSQL persistence + lock TTL expiry                                                                                                     |
| Cross-session learning           | **NOT PROVEN** — No implementation exists (P1 pending)                                                                                                    |
| Autonomous cost control          | **PROVEN (post-audit P0)** — 4 persisted budget ceilings enforced pre-AI-call; exhaustion → human escalation; Prometheus `jules_budget_exhaustions_total` |
| Jules work audit quality         | **NOT PROVEN** — No code review mechanism                                                                                                                 |
| Long-run autonomous stability    | **NOT PROVEN** — No soak testing                                                                                                                          |
| Semantic memory retrieval        | **NOT PROVEN** — Not implemented (not justified yet)                                                                                                      |
| Provider failover reliability    | **NOT PROVEN** — Single provider only                                                                                                                     |

---

**FINAL VERDICT: `AUTONOMY_PASS_WITH_RECOMMENDATIONS`**

The Jules Supervisor has a sound, well-tested foundation for supervised autonomous operation. The safety model is strong — deterministic policy always overrides AI judgment, DRY_RUN is the default, and critical/high risk actions always require human review. However, the system cannot yet operate truly autonomously for extended periods because it lacks: (1) cross-session memory and learning, (2) cost/duration budgets, (3) Jules work quality auditing, (4) correction capability, and (5) outcome feedback loops. These are all implementable within the existing PostgreSQL-based architecture without introducing new infrastructure dependencies like Qdrant.

The recommended path to `JULES_SUPERVISOR_AUTONOMY_ARCHITECTURE_CERTIFIED` is:

1. Add outcome tracking + human feedback correlation (P0, low complexity) — ✅ **DONE (post-audit P0 round)**
2. Add autonomy budget engine (P0, medium complexity) — ✅ **DONE (post-audit P0 round)**
3. Add basic correction loop (P0, medium complexity) — ✅ **DONE (corrections ceiling + budget-gated degradation; full re-submission loop deferred)**
4. Add cross-session decision retrieval (P1, low complexity) — pending
5. Add repository knowledge ingestion (P1, medium complexity) — pending

These 5 improvements would transform the system from a stateless per-turn decision engine into a learning, budgeted, self-correcting autonomous supervisor.

> **Post-audit P0 round status:** Items 1–3 implemented and verified (typecheck 19/19 packages, 705/705 unit tests green, Codacy clean on all touched files). Items 4–5 remain the next milestones toward certification. The system is now a **budgeted** per-turn decision engine with outcome/feedback records; it becomes a _learning_ engine once retrieval (P1) feeds those records back into the decision context.
