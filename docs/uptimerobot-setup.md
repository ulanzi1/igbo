# UptimeRobot Setup Guide

This guide explains how to configure UptimeRobot for external uptime monitoring of OBIGBO.

## Overview

UptimeRobot provides external HTTP health checks that run every 60 seconds from multiple global locations. It alerts the ops team when the platform is unreachable.

## Creating a Monitor

1. Log in to [UptimeRobot](https://uptimerobot.com/) (free tier supports up to 50 monitors)
2. Click **+ Add New Monitor**
3. Configure as follows:

### Monitor Type: HTTP(S)

| Field               | Value                                         |
| ------------------- | --------------------------------------------- |
| Monitor Type        | HTTP(S)                                       |
| Friendly Name       | OBIGBO Production                             |
| URL                 | `https://<your-domain>/api/health`            |
| Monitoring Interval | 5 minutes (free tier) or 1 minute (paid tier) |

### Keyword Monitor (Recommended)

Add a second monitor to verify the response body:

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Monitor Type | Keyword                            |
| URL          | `https://<your-domain>/api/health` |
| Keyword      | `"status":"ok"`                    |
| Alert When   | Keyword NOT exists                 |

This catches scenarios where the server responds with 200 but the health check returns unexpected content.

## Alert Contacts

1. Go to **My Settings** → **Alert Contacts**
2. Add an **Email** contact for the ops team email address
3. Optional: Add a **Slack** integration (UptimeRobot has a native Slack app)
4. Optional: Add a **Webhook** contact pointing to your incident management system

## Assigning Alert Contacts to Monitors

When creating or editing a monitor:

1. Scroll to **Alert Contacts To Notify**
2. Select the email/Slack contacts you created
3. Set **Alert After** to 2 failures (avoids false positives from transient failures)

## Health Check Endpoint

The `/api/health` endpoint returns:

```json
{ "status": "ok" }
```

This is a lightweight endpoint that always returns 200 as long as the Next.js server is running. It does **not** check the database or Redis — use `/api/v1/health` for a full health check (not recommended for UptimeRobot due to credentials).

## Status Page (Optional)

UptimeRobot offers a free public status page at `https://stats.uptimerobot.com/<your-id>`. Enable this to provide a public-facing status page for community members during incidents.

## Incident Response

When UptimeRobot sends a downtime alert:

1. Check Grafana dashboards for error rate and latency spikes
2. Check Docker container logs: `docker logs igbo-web` and `docker logs igbo-realtime`
3. Check the full health endpoint: `curl https://<domain>/api/v1/health`
4. Refer to `docs/secrets-management.md` for emergency access credentials
