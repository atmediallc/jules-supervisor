# Operations & Operational Runbook

## 1. Supervisor Execution Modes

Jules Supervisor operates with strict execution isolation:

```
DISABLED      -> System is dormant; no sessions are monitored and no decisions are made.
DRY_RUN       -> System ingests sessions, calculates decisions and policy risks, persists audit trail, but NEVER mutates Google Jules API. (DEFAULT)
ASSISTED      -> System calculates decisions and routes them to the Human Approval Queue in Next.js Control Plane.
AUTO_RESPOND  -> System autonomously answers low-risk questions when policy permits; high-risk items remain in Human Approval Queue.
FULL_AUTO     -> Full autonomous execution permitted within deterministic policy risk rules.
```

To switch execution mode safely:
Set `SUPERVISOR_MODE=DRY_RUN` in `.env` or container environment and restart worker daemon.

---

## 2. Managing the Human Approval Queue

1. Access the web dashboard at `http://localhost:3000/approvals`.
2. Review pending actions, risk level, confidence score, and technical reason.
3. Choose:
   - **APPROVE & DISPATCH**: Immediately sends the recommended response/approval to Jules.
   - **REJECT ACTION**: Suppresses the action and marks the decision as rejected.
   - **EDIT RESPONSE**: Allows customizing the text payload before dispatching.

---

## 3. Monitoring Health & Metrics

- Liveness check: `GET http://localhost:3000/health/live` -> `{ "status": "alive" }`
- Readiness check: `GET http://localhost:3000/health/ready` -> `{ "status": "ready", "mode": "DRY_RUN" }`
- Telemetry snapshot: Logged structured JSON format via Pino containing latencies, risk breakdown, and decision totals.
