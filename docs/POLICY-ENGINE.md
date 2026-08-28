# Policy Engine Specification

## 1. Purpose & Authority

The **Policy Engine** is the deterministic gatekeeper of Jules Supervisor.
It operates downstream of the AI Decision Engine and holds **absolute authority** over execution.

```
+---------------------+
| AI Recommendation   |  (e.g., action: "APPROVE_PLAN", confidence: 0.99)
+---------------------+
           |
           v
+---------------------+
| Risk Classifier     |  (Calculates: LOW | MEDIUM | HIGH | CRITICAL)
+---------------------+
           |
           v
+---------------------+
| Policy Evaluator    |  (Applies System & Project Rules)
+---------------------+
           |
           +-----------------------+-----------------------+
           |                       |                       |
     [PASSED POLICY]      [ESCALATE TO HUMAN]        [HARD BLOCKED]
           |                       |                       |
           v                       v                       v
     Execution Gate       Approval Request Created   Action Suppressed
```

---

## 2. Risk Levels & Matrix

| Risk Level   | Definition                                                                                   | Default Permitted Actions                                                 |
| ------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **LOW**      | Non-destructive changes, documentation, tests, safe formatting, simple explanations.         | `RESPOND` (if `AUTO_RESPOND` enabled)                                     |
| **MEDIUM**   | Standard code refactoring, non-auth feature logic, dependency version bumps.                 | Requires Human Review in `ASSISTED` / `AUTO_RESPOND`; Auto in `FULL_AUTO` |
| **HIGH**     | Database migrations, auth/authorization code, API route changes, billing logic.              | **Always Requires Human Review**                                          |
| **CRITICAL** | Production configs, secret changes, force pushes, destructive SQL, disabling tests/security. | **Hard Blocked / Human Super-Admin Only**                                 |

---

## 3. Hard Veto Triggers

Under no circumstances will the Policy Engine auto-execute an action if:

1. `filesChanged` matches security paths: `**/.env*`, `**/auth/**`, `**/migrations/**`, `**/.github/workflows/**`, `**/security/**`.
2. Diff contains destructive commands: `DROP TABLE`, `DELETE FROM`, `rm -rf`, `git push --force`, `--no-verify`.
3. AI decision alters or deletes security controls (e.g. removing test assertions, disabling linter rules, bypassing token validation).
4. Jules session cycle count exceeds `MAX_SESSION_CYCLES` (loop prevention).
5. AI confidence is below `CONFIDENCE_THRESHOLD` (default: 0.85).
