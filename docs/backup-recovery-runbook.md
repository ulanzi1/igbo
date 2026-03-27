# OBIGBO Backup & Disaster Recovery Runbook

**RTO Target:** < 4 hours (full platform recovery from backup)
**RPO Target:** < 24 hours (daily dump) / < 5 minutes (pg_basebackup + WAL archiving PITR)

## Overview

OBIGBO uses a two-tier backup strategy:

1. **Daily pg_dump** — Full database snapshot at 2:00 AM UTC, uploaded to Hetzner Object Storage. Provides RPO of up to 24 hours.
2. **Weekly pg_basebackup** — Physical base backup every Sunday at 3:00 AM UTC. Required as the base for WAL-based PITR.
3. **WAL archiving** — PostgreSQL write-ahead logs uploaded to S3 continuously (every ~5 minutes via `archive_timeout`). Combined with physical base backup, enables point-in-time recovery (PITR) to any moment with RPO of ~5 minutes.

---

## Section 1 — Backup Architecture

### Backup Flow

```
PostgreSQL DB
    │
    ├── pg_dump -Fc (2:00 AM UTC daily)
    │       │
    │       └── Backup sidecar → s3://igbo-backups/daily/YYYY-MM-DDTHHMMSSZ.dump
    │
    └── WAL segments (every ~5 min via archive_timeout)
            │
            └── archive_command → wal-archive.sh → s3://igbo-backups/wal-archive/<segment>
```

### S3 Storage Structure

```
s3://igbo-backups/
  daily/
    2026-03-01T020000Z.dump    ← full daily backup (pg_dump -Fc custom format)
    2026-03-02T020000Z.dump
    ...
    2026-03-24T020000Z.dump
  base-backups/
    2026-03-02T030000Z.tar.gz  ← weekly physical backup (pg_basebackup, for PITR)
    2026-03-09T030000Z.tar.gz
    ...
  wal-archive/
    000000010000000000000001   ← WAL segments (continuous)
    000000010000000000000002
    ...
```

### Retention Policy

- **Daily backups**: 30-day rolling retention (retention-cleanup.sh runs at 3:30 AM UTC)
- **WAL archive**: 30-day rolling retention (cleaned alongside daily backups)
- **Monthly verification**: automated restore test on 1st of each month (verify-backup.sh)

### Components

| Component                   | Location                          | Schedule                  |
| --------------------------- | --------------------------------- | ------------------------- |
| `backup.sh`                 | Backup sidecar `/scripts/backup/` | Daily 2:00 AM UTC         |
| `base-backup.sh`            | Backup sidecar                    | Weekly Sunday 3:00 AM UTC |
| `retention-cleanup.sh`      | Backup sidecar                    | Daily 3:30 AM UTC         |
| `verify-backup.sh`          | Backup sidecar                    | Monthly 4:00 AM UTC (1st) |
| `check-backup-freshness.sh` | Backup sidecar                    | Daily 5:00 AM UTC         |
| `wal-archive.sh`            | PostgreSQL container              | Continuous (~5 min)       |

---

## Section 2 — Routine Operations

### Verify backup status

```bash
# Check if backup ran in the last 25 hours
docker logs backup --since 25h | grep backup_completed

# Check for any backup errors
docker logs backup --since 7d | grep '"level":"error"'
```

### List available backups

```bash
aws s3 ls s3://${BACKUP_S3_BUCKET}/daily/ \
  --endpoint-url ${BACKUP_S3_ENDPOINT} \
  --recursive \
  --human-readable \
  --summarize
```

### Trigger manual backup

```bash
docker exec backup /scripts/backup/backup.sh
```

### Check backup freshness

```bash
docker exec backup /scripts/backup/check-backup-freshness.sh
```

### Run manual backup verification

```bash
docker exec backup /scripts/backup/verify-backup.sh
```

---

## Section 3 — Full Recovery from Daily Backup

**RTO target: < 2 hours** (within 4-hour overall RTO)

Use this procedure for: database corruption, disk failure, full server loss, accidental data deletion.

### Step-by-step procedure

**Step 1: Assess the situation**

Determine what failed:

- DB corruption → restore to same server
- Disk failure → need new server
- Full server loss → provision replacement server

**Step 2: Provision replacement infrastructure** _(if server lost)_

```bash
# On new Hetzner server:
# 1. Install Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER

# 2. Clone repository or copy deployment files
git clone https://github.com/your-org/igbo.git /app
cd /app

# 3. Copy .env file from secure backup (password manager / secrets manager)
# cp /path/to/backup/.env .env
```

**Step 3: Stop application containers** _(if server is accessible)_

```bash
docker compose -f docker-compose.prod.yml stop web realtime
```

**Step 4: Identify target backup**

```bash
# List available backups (newest last)
aws s3 ls s3://${BACKUP_S3_BUCKET}/daily/ \
  --endpoint-url ${BACKUP_S3_ENDPOINT} \
  --recursive

# Note the key of the backup to restore, e.g.:
# daily/2026-03-24T020000Z.dump
```

**Step 5: Run restore**

```bash
# Restore latest backup (interactive — requires typing 'yes')
docker exec -it backup /scripts/backup/restore.sh latest

# Or restore a specific backup:
docker exec -it backup /scripts/backup/restore.sh daily/2026-03-24T020000Z.dump
```

**Step 6: Start application containers**

```bash
docker compose -f docker-compose.prod.yml up -d web realtime
```

**Step 7: Verify platform health**

```bash
# Check health endpoint
curl https://obigbo.app/api/v1/health

# Expected: {"status":"ok","services":{"db":"ok","redis":"ok","realtime":"ok"}}
```

**Step 8: Verify data integrity**

- Log in as admin and access dashboard
- Spot-check recent posts, articles, and conversations
- Verify file uploads are accessible (S3 is independent — survives DB-only failure)

**Step 9: Update DNS** _(if server IP changed)_

See Section 5 — DNS Failover.

**Step 10: Notify team**

Notify the engineering team and relevant stakeholders of recovery completion, including:

- Recovery timestamp
- Backup used (key + age)
- Data loss window (if any)

---

## Section 4 — Point-in-Time Recovery

**Use for:** Data corruption where you know the corruption timestamp and need to recover to just before it.

PITR uses a physical base backup (`pg_basebackup`, created weekly by `base-backup.sh`) combined with continuous WAL archiving to replay the database to any point in time with ~5-minute RPO.

### Prerequisites

- A physical base backup must exist in `s3://BUCKET/base-backups/` (created by `base-backup.sh`, runs weekly Sunday 3:00 AM UTC)
- WAL segments must be archived in `s3://BUCKET/wal-archive/` (continuous via `archive_command`)

### Identify the corruption timestamp

1. Check audit logs in admin dashboard (`/admin/audit-logs`)
2. Review user reports and timestamps
3. Check application logs: `docker logs web --since 24h | grep -i error`

### Run PITR

```bash
# Stop ALL containers (PostgreSQL must be stopped for PGDATA replacement)
docker compose -f docker-compose.prod.yml stop web realtime postgres

# Run PITR to target timestamp (ISO 8601)
docker exec -it backup /scripts/backup/restore-pitr.sh "2026-03-24T15:30:00Z"
```

The script will:

1. Download the most recent physical base backup (pg_basebackup) from S3
2. Replace PGDATA contents with the physical backup
3. Configure PostgreSQL recovery to replay WAL until the target time

### Complete recovery

```bash
# After PITR configuration is written, restart PostgreSQL
docker compose -f docker-compose.prod.yml restart postgres

# Monitor PostgreSQL logs for recovery completion
docker logs postgres -f | grep -E "recovery|promote"

# Once PostgreSQL logs "recovery stopping before commit of transaction":
# Promote to primary (removes recovery.signal automatically)
docker exec postgres psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "SELECT pg_promote();"

# Start application containers
docker compose -f docker-compose.prod.yml up -d web realtime
```

### Verify recovery

```bash
# Check that data is present up to just before corruption
# (application-specific verification based on corruption type)
curl https://obigbo.app/api/v1/health
```

---

## Section 5 — DNS Failover

Use when recovering to a server with a different IP address.

### Cloudflare DNS update

1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select the `obigbo.app` zone
3. Navigate to DNS → Records
4. Update the `A` record for `obigbo.app` to the new server IP
5. Update the `A` record for `www.obigbo.app` (if separate)

### TTL considerations

- Cloudflare proxied records propagate within ~60 seconds
- If using "DNS only" (grey cloud), propagation can take up to TTL seconds (check current TTL)
- Set TTL to 60s before planned maintenance; restore to 3600s after recovery

### SSL certificates

- If using Cloudflare proxy (orange cloud): SSL is handled by Cloudflare — no action needed
- If using Let's Encrypt directly: `certbot renew` or issue new certificate for the new server

---

## Section 6 — Post-Recovery Verification Checklist

Run through this checklist after any recovery procedure:

- [ ] Health endpoint returns 200 with all services healthy
  ```bash
  curl -s https://obigbo.app/api/v1/health | jq .
  ```
- [ ] Admin can log in and access dashboard (`/admin`)
- [ ] Recent posts/articles visible in feed (spot-check last 24h of content)
- [ ] Chat messages load correctly (check a recent conversation)
- [ ] File uploads accessible — images in posts/articles load from S3
- [ ] WebSocket connections establish — realtime server running
  ```bash
  docker logs realtime --since 5m | grep "connected"
  ```
- [ ] Background jobs running
  ```bash
  docker logs web --since 5m | grep job_completed
  ```
- [ ] New backup triggered and completed successfully
  ```bash
  docker exec backup /scripts/backup/backup.sh
  ```
- [ ] Backup freshness check passes
  ```bash
  docker exec backup /scripts/backup/check-backup-freshness.sh
  ```

---

## Section 7 — Contact & Escalation

### Incident Communication

During a recovery incident:

1. Post initial status in the engineering Slack channel immediately
2. Update status page (if configured) to reflect degraded service
3. Post updates every 30 minutes until resolved
4. Post final recovery notification with timeline and data loss assessment

### Escalation Path

| Severity                         | Who to notify                         |
| -------------------------------- | ------------------------------------- |
| Data loss suspected              | Engineering lead + CTO immediately    |
| RTO > 2 hours                    | Engineering lead                      |
| Complete service outage > 15 min | Engineering lead + status page update |

### Key Resources

- Hetzner Console: https://console.hetzner.cloud
- Cloudflare Dashboard: https://dash.cloudflare.com
- Sentry Error Tracking: https://sentry.io (check for error spike context)
- S3 Backup Bucket: `${BACKUP_S3_BUCKET}` via `${BACKUP_S3_ENDPOINT}`

---

_Last updated: Epic 12 retro — TD-1 PITR fix (pg_basebackup added)_
