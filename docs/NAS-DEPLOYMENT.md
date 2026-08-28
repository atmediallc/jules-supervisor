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

Ensure storage permissions match container users (UID 1001 for web/worker, UID 999 for postgres):

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
