# Docker-Based NAS Deployment Guide (Synology / QNAP / TrueNAS / Unraid)

## 1. Overview

Jules Supervisor is designed to run 24/7 on a Docker-capable Network Attached Storage (NAS) or headless home/edge server.

## 2. Directory Layout on NAS

Create a dedicated folder for Jules Supervisor on your NAS storage volume:

```text
/volume1/docker/jules-supervisor/
├── .env
├── docker-compose.yml
├── data/
│   ├── postgres/
│   └── redis/
```

## 3. Persistent Volumes Configuration

The bundled `docker-compose.yml` uses Docker named volumes (`postgres_data` and `redis_data`). Data is persisted under the Docker volume directory on the NAS storage pool — no manual directory setup is required.

If you prefer explicit bind mounts (e.g., to back up a plain directory), override the volumes in your own compose override file:

```yaml
services:
  postgres:
    volumes:
      - /volume1/docker/jules-supervisor/data/postgres:/var/lib/postgresql/data
  redis:
    volumes:
      - /volume1/docker/jules-supervisor/data/redis:/data
```

When using bind mounts, match the container users (UID 999 for postgres):

```bash
mkdir -p /volume1/docker/jules-supervisor/data/postgres
mkdir -p /volume1/docker/jules-supervisor/data/redis
chmod -R 750 /volume1/docker/jules-supervisor/data
```

## 4. Running the Stack

Deploy via Container Manager or Docker CLI:

```bash
cd /volume1/docker/jules-supervisor
docker compose up -d
```

## 5. Automated Backups & Upgrades

### Database Backup via Cron

Add a periodic scheduled task in your NAS management console:

```bash
docker exec jules-supervisor-postgres pg_dump -U jules_user jules_supervisor | gzip > /volume1/docker/jules-supervisor/backups/backup_$(date +\%Y\%m\%d_\%H\%M\%S).sql.gz
```

### Zero-Downtime Image Upgrades

```bash
docker compose pull
docker compose up -d --no-deps web worker
```
