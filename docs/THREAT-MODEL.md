# Threat Model & Risk Analysis

## 1. System Threat Landscape

```
                          ATTACK SURFACE
   [Malicious Repo Code] ---> Context Builder ---> [Prompt Injection Risk]
   [Malicious Jules Output] -> Context Builder
   [Rogue Model Output] -----> Decision Engine ---> [Schema Bypass Risk]
   [Network Attacker] -------> External API -----> [SSRF / Replay Risk]
   [Concurrent Worker] ------> Execution Gate ----> [Race Condition Risk]
```

## 2. Threat Classification & Mitigation

### TM-01: Prompt Injection via Repository Code or Jules Messages

- **Threat**: Attacker puts prompt injection payloads in repository files or commits, instructing the supervisor to approve destructive actions or leak secrets.
- **Impact**: Unauthorized code changes, data leakage, policy bypass.
- **Mitigation**:
  - Semantic isolation with tagged untrusted sections (`<untrusted_content>`).
  - Strict system prompt anchoring that explicitly disallows data blocks from executing commands.
  - Policy Engine verifies decisions with deterministic rules regardless of LLM rationale.

### TM-02: Rogue or Hallucinated Autonomous Execution

- **Threat**: AI model returns a dangerous instruction (e.g. `DROP TABLE`, `rm -rf /`, force push to main).
- **Impact**: Data loss, production downtime.
- **Mitigation**:
  - Deterministic regex & AST analysis of proposed code changes and responses.
  - Hard safety veto rules: operations touching migrations, credentials, auth, or infrastructure require manual human approval.

### TM-03: Double-Mutation Race Conditions

- **Threat**: Multiple background workers ingest the same pending activity simultaneously or network timeout triggers an uncoordinated retry.
- **Impact**: Duplicate messages or multiple approvals sent to Jules API.
- **Mitigation**:
  - Deterministic idempotency key: `hash(sessionId + activityId + actionType)`.
  - Database-level unique constraint.
  - Distributed lock on `session:{sessionId}`.

### TM-04: Secret Exfiltration in Logs or AI Prompts

- **Threat**: Application logs or AI prompt histories store raw API keys, bearer tokens, or DB passwords.
- **Impact**: Credential theft from log aggregators or model providers.
- **Mitigation**:
  - Structured log scrubbers redact high-entropy tokens and predefined secret keys.
  - Context builder scrubs environment variables and known secret patterns before sending prompts.

### TM-05: Server-Side Request Forgery (SSRF) via AI Provider Base URLs

- **Threat**: Malicious admin or config sets `AI_BASE_URL` to `http://169.254.169.254/computeMetadata/v1/`.
- **Impact**: Cloud IAM credential theft.
- **Mitigation**:
  - URL validator checks IP addresses, blocked hostnames, and loopback ranges prior to outgoing requests.
