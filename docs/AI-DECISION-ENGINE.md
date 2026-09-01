# AI Decision Engine Specification

## 1. Engine Architecture

The AI Decision Engine provides a structured, schema-enforced interface for evaluating Google Jules sessions. It currently ships a single active provider — the OpenAI-compatible adapter (default when `AI_PROVIDER_TYPE=openai`) and a `mock` provider for local DRY_RUN/testing. It is **not** a multi-provider router today; provider failover is a documented roadmap item, not an implemented capability.

```
+-------------------------------------------------------------+
|                      Context Builder                        |
|  - Token budgeting (Max 4,000 / 8,000 / 16,000 tokens)      |
|  - Sensitive secret redaction                               |
|  - Untrusted data encapsulation (<untrusted_repo_context>)  |
|  - Deterministic context digest (SHA-256)                   |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                   AI Provider Subsystem                     |
|  - OpenAI-compatible transport (primary)                    |
|  - Mock provider for DRY_RUN / local testing                |
|  - Configurable timeouts & abort signal support             |
|  - Latency & token usage telemetry                          |
|  - Note: no multi-provider router today (roadmap item)      |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                  Zod Decision Schema                        |
|  - Strict schema parsing (rejects arbitrary markdown/text)  |
|  - Schema validation failure fails safe (REQUEST_HUMAN)     |
+-------------------------------------------------------------+
```

---

## 2. Structured Decision Output Schema

The model MUST return JSON conforming to the following schema:

```ts
import { z } from "zod";

export const DecisionSchema = z.object({
  action: z.enum([
    "RESPOND",
    "APPROVE_PLAN",
    "REQUEST_CHANGES",
    "REQUEST_HUMAN",
    "IGNORE",
    "BLOCK",
  ]),
  response: z.string().nullable().describe("Text response or feedback to send to Jules"),
  risk: z.enum(["low", "medium", "high", "critical"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().describe("Concise technical rationale for the decision"),
  evidence: z.array(z.string()).default([]).describe("Concrete evidence from code/activities"),
  concerns: z
    .array(z.string())
    .default([])
    .describe("Identified risks, caveats, or potential regressions"),
});

export type DecisionResult = z.infer<typeof DecisionSchema>;
```

---

## 3. Consensus Engine (Optional Multi-Model Verification) — Roadmap

> **Status: NOT IMPLEMENTED.** This section is a specification for a future capability. The current engine runs a single provider; there is no primary/reviewer/reconciler flow.

For high-risk decisions or when configured (future):

1. **Primary Model**: Generates initial decision.
2. **Reviewer Model**: Independently analyzes context and primary decision.
3. **Reconciler**: If disagreement occurs, escalates immediately to `REQUEST_HUMAN`.
