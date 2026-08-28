# Incident Response & Disaster Recovery Runbook

## 1. Emergency Kill Switch (Disabling Automation)

If Jules Supervisor displays unexpected behavior or external API anomalies occur:

### Immediate Action

Switch execution mode to `DISABLED` or `DRY_RUN`:

```bash
# In .env or docker-compose environment
SUPERVISOR_MODE=DISABLED

# Restart worker daemon to drop all active watchers
docker compose restart worker
```

## 2. Ambiguous Network Failure Recovery

If a network timeout occurs while sending a message or approving a plan against Jules API:

1. **Never blindly resend**. The pipeline acquires an idempotency lock and re-verifies session state.
2. The poller will inspect the latest activity list from Jules API to verify if the previous mutation was received.
3. If received, the local decision is updated to `EXECUTED`. If absent and session state is unchanged, the action is safely dispatched once.

## 3. Database Restoration

To restore from a PostgreSQL backup snapshot:

```bash
# Stop application services
docker compose stop web worker

# Restore database dump
gunzip -c backup_20260827_120000.sql.gz | docker exec -i jules-supervisor-postgres psql -U jules_user -d jules_supervisor

# Restart services
docker compose start web worker
```
