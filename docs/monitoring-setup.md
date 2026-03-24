# Monitoring Stack Setup

This guide covers the self-hosted Prometheus + Grafana + Alertmanager monitoring stack for OBIGBO.

## Architecture

- **Prometheus**: Scrapes metrics from the web app (`/api/metrics`), realtime server (`/metrics`), and host OS (`node-exporter`).
- **Grafana**: Visualizes metrics from Prometheus with pre-built dashboards.
- **node-exporter**: Exposes host CPU, memory, disk, and network metrics.
- **Alertmanager**: Routes alerts from Prometheus to email and/or Slack.

## Prerequisites

- Production compose stack running: `docker compose -f docker-compose.prod.yml up -d`
- `app-network` Docker network created (done automatically by docker-compose.prod.yml)
- `.env` file with `GRAFANA_ADMIN_PASSWORD` and `METRICS_SECRET` set

## Starting the Monitoring Stack

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.monitoring.yml up -d
```

Or start just the monitoring stack (after production stack is running):

```bash
docker compose -f docker-compose.monitoring.yml up -d
```

## Accessing Services

- **Grafana**: http://localhost:3002 (or `https://<your-domain>:3002`)
  - Default login: `admin` / `<GRAFANA_ADMIN_PASSWORD from .env>`
  - Pre-provisioned dashboard: **OBIGBO Platform Overview**
- **Prometheus**: http://localhost:9090
  - Query interface for raw metrics
- **Alertmanager**: http://localhost:9093
  - Alert status and silencing

## Pre-built Dashboard

The `OBIGBO Platform Overview` dashboard is automatically provisioned from `monitoring/grafana/dashboards/igbo-overview.json`. It includes panels for:

- HTTP request rate and error rate (5xx)
- p95 API latency
- Active WebSocket connections (by namespace)
- CPU, memory, and disk usage (from node-exporter)
- Redis memory usage
- Application error rate

## Adding Custom Dashboards

1. Create a dashboard in the Grafana UI
2. Export it as JSON (Dashboard → Share → Export)
3. Save to `monitoring/grafana/dashboards/<name>.json`
4. Restart the monitoring stack to auto-provision

## Alert Configuration

Alerts are defined in `monitoring/prometheus/alert-rules.yml`. Notifications are sent via Alertmanager to email and/or Slack (configured in `monitoring/alertmanager/alertmanager.yml`).

Required environment variables for Alertmanager:

```
ALERTMANAGER_SMTP_HOST=smtp.example.com
ALERTMANAGER_SMTP_PORT=587
ALERTMANAGER_SMTP_FROM=alerts@obigbo.app
ALERTMANAGER_SMTP_USERNAME=alerts@obigbo.app
ALERTMANAGER_SMTP_PASSWORD=your-smtp-password
ALERTMANAGER_OPS_EMAIL=ops@obigbo.app
ALERTMANAGER_SLACK_WEBHOOK=https://hooks.slack.com/services/...  # optional
```

## Stopping the Monitoring Stack

```bash
docker compose -f docker-compose.monitoring.yml down
```

Data is persisted in Docker volumes (`prometheusdata`, `grafanadata`).

## Backup Monitoring

The backup sidecar does **not** expose a Prometheus `/metrics` endpoint — monitoring is log-based.

### Verify backup ran (last 25 hours)

```bash
docker logs backup --since 25h | grep backup_completed
```

Expected output example:

```json
{
  "timestamp": "2026-03-24T02:03:12Z",
  "level": "info",
  "message": "backup_completed",
  "file": "daily/2026-03-24T020000Z.dump",
  "size_bytes": 52428800
}
```

### Check backup freshness

```bash
docker exec backup /scripts/backup/check-backup-freshness.sh
```

This queries S3 for the most recent backup and alerts (exit code 1 + error log) if older than 25 hours.

### Trigger manual backup

```bash
docker exec backup /scripts/backup/backup.sh
```

### Trigger manual backup verification

```bash
docker exec backup /scripts/backup/verify-backup.sh
```

This downloads the latest backup, restores to a temporary PostgreSQL container, runs integrity checks, then destroys the temp container. Requires Docker socket access (mounted in backup sidecar).

### Check backup freshness alerts

```bash
docker logs backup --since 1h | grep backup_freshness_alert
```

### View all backup-related errors

```bash
docker logs backup --since 7d | grep '"level":"error"'
```
