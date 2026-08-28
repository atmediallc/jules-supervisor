# AI Decision Engine Specification

## 1. Engine Architecture

The AI Decision Engine provides a provider-agnostic, structured interface for evaluating Google Jules sessions.

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
|  - OpenAI-compatible transport                              |
|  - OmniRoute routing integration                            |
|  - Configurable timeouts & abort signal support             |
|  - Latency & token usage telemetry                          |
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

## 3. Consensus Engine (Optional Multi-Model Verification)

For high-risk decisions or when configured:

1. **Primary Model**: Generates initial decision.
2. **Reviewer Model**: Independently analyzes context and primary decision.
3. **Reconciler**: If disagreement occurs, escalates immediately to `REQUEST_HUMAN`.
