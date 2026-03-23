# Kubernetes Migration Guide

This document describes the Kubernetes migration path for the OBIGBO platform — when to migrate,
prerequisites, manifests, and rollback procedures.

---

## 1. Migration Trigger

**Migrate to Kubernetes when concurrent users approach 2,000.**

At ~2,000 concurrent WebSocket connections, a single Hetzner CX41 server (4 vCPU, 8GB RAM)
will approach resource limits. Kubernetes enables horizontal scaling of the Web and Realtime
workloads independently.

Monitoring signals to watch (configured in Story 12.3):

- CPU utilisation on `igbo-web` container sustained above 70% for 15+ minutes
- Memory on `igbo-web` sustained above 80%
- Socket.IO connection count on `igbo-realtime` exceeds 1,500
- P95 response time on `/api/v1/*` exceeds 500ms

---

## 2. Prerequisites

Before migrating:

| Requirement        | Details                                                                     |
| ------------------ | --------------------------------------------------------------------------- |
| Managed Kubernetes | Hetzner Cloud Kubernetes (Hetzner K3s or full K8s via kube-hetzner)         |
| Container Registry | GitHub Container Registry (GHCR) — images already pushed by CI (Story 12.1) |
| Managed PostgreSQL | Hetzner Managed Database Service — switch from self-hosted Docker container |
| Managed Redis      | Hetzner Redis or Upstash Redis — switch from self-hosted Docker container   |
| Helm v3            | For chart-based deployment                                                  |
| kubectl            | Configured with kubeconfig for the Hetzner K8s cluster                      |
| cert-manager       | For automated TLS (Let's Encrypt) via Ingress                               |
| ingress-nginx      | NGINX Ingress controller for routing + sticky sessions                      |

### 2.1 Database and Redis Migration

When migrating to Kubernetes, **switch from self-hosted containers to managed services**:

1. **PostgreSQL**: Migrate to Hetzner Cloud Database (PostgreSQL 16).
   - Export data: `pg_dump -h localhost -U $POSTGRES_USER $POSTGRES_DB > backup.sql`
   - Restore to managed database: `psql $MANAGED_DATABASE_URL < backup.sql`
   - Update `DATABASE_URL` to point to managed database endpoint.

2. **Redis**: Migrate to Hetzner Redis or Upstash Redis.
   - Redis data is ephemeral (sessions, cache, points leaderboard) — no migration needed.
   - Update `REDIS_URL` to point to managed Redis endpoint.

### 2.2 Connection Pooling

**Single-server (current):** Per-container pool size of 20 (`DATABASE_POOL_SIZE=20`) is sufficient.

**Kubernetes (scaled):** With multiple Web pods, total connections = `pods × 20`. At 8 pods = 160
connections — within PostgreSQL's default `max_connections=100` but tight.

**Migration to pgBouncer (when connection exhaustion is observed):**

1. Deploy pgBouncer as a Kubernetes Deployment in the `igbo` namespace.
2. Set pgBouncer `pool_mode = transaction` and `max_client_conn = 500`.
3. Update `DATABASE_URL` in K8s ConfigMap to point to pgBouncer service.
4. Reduce `DATABASE_POOL_SIZE` to 5 per pod (pgBouncer multiplexes the connections).

pgBouncer provides the centralised connection pooling scaling path when connection exhaustion
is first observed — defer deployment until needed.

---

## 3. K8s Manifests

Starter manifests are in `k8s/`:

```
k8s/
├── namespace.yaml           # igbo namespace
├── web-deployment.yaml      # Web (Next.js) Deployment — 2 replicas, readiness/liveness probes
├── web-service.yaml         # ClusterIP Service for Web
├── web-hpa.yaml             # HPA: min 2, max 8 replicas; CPU 70%, Memory 80%
├── realtime-deployment.yaml # Realtime (Socket.IO) Deployment — sticky session annotations
├── realtime-service.yaml    # ClusterIP Service for Realtime
└── helm/igbo/               # Helm chart (parameterised versions of above)
    ├── Chart.yaml
    ├── values.yaml
    └── templates/
```

### 3.1 Applying Manifests (kubectl)

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Create secrets (from production .env file)
kubectl create secret generic igbo-secrets \
  --from-env-file=.env \
  -n igbo \
  --dry-run=client -o yaml | kubectl apply -f -

# Deploy web and realtime
kubectl apply -f k8s/web-deployment.yaml
kubectl apply -f k8s/web-service.yaml
kubectl apply -f k8s/web-hpa.yaml
kubectl apply -f k8s/realtime-deployment.yaml
kubectl apply -f k8s/realtime-service.yaml
```

### 3.2 Deploying via Helm (recommended)

```bash
# First install
helm install igbo ./k8s/helm/igbo \
  --namespace igbo \
  --create-namespace \
  --set image.tag=sha-abc1234

# Upgrade after new image push
helm upgrade igbo ./k8s/helm/igbo \
  --namespace igbo \
  --set image.tag=sha-newsha123

# View release status
helm status igbo -n igbo
```

---

## 4. Socket.IO Sticky Sessions

Socket.IO requires that WebSocket connections from the same client consistently hit the same pod
(sticky sessions) unless the Redis adapter is used.

**Option A — Ingress affinity (recommended for initial migration):**
The `igbo-realtime` deployment and service include the NGINX Ingress cookie affinity annotations:

```yaml
nginx.ingress.kubernetes.io/affinity: "cookie"
nginx.ingress.kubernetes.io/session-cookie-name: "igbo-realtime-affinity"
```

This routes WebSocket upgrade requests from the same browser to the same Realtime pod.

**Option B — Redis adapter (recommended for stable K8s operation):**
The Redis adapter (`socket.io-redis`) is already configured in the Realtime server
(`src/server/realtime.ts`). With a shared Redis instance, all Realtime pods share
subscription state — eliminating the sticky session requirement. Switch to this once
managed Redis is provisioned.

---

## 5. Migration Checklist

- [ ] Hetzner K8s cluster provisioned and kubectl configured
- [ ] ingress-nginx and cert-manager installed on cluster
- [ ] GHCR images accessible from cluster (verify `imagePullPolicy` and registry auth)
- [ ] Managed PostgreSQL provisioned and data migrated
- [ ] Managed Redis provisioned and `REDIS_URL` updated
- [ ] K8s Secrets created from production `.env` (`kubectl create secret`)
- [ ] K8s ConfigMap created with non-secret env vars
- [ ] Ingress resource created with TLS (cert-manager annotation)
- [ ] DNS updated: CNAME to cluster LoadBalancer IP (or Cloudflare proxied A record updated)
- [ ] Health checks verified: `kubectl get pods -n igbo` — all pods Running
- [ ] Web readiness probe passing: `kubectl describe pod igbo-web-<hash> -n igbo`
- [ ] Realtime readiness probe passing: `kubectl describe pod igbo-realtime-<hash> -n igbo`
- [ ] Smoke test: `/api/v1/health` returns `{"status":"healthy",...}`
- [ ] HPA active: `kubectl get hpa -n igbo`
- [ ] Old Hetzner server kept running for 24h rollback window

---

## 6. DNS Cutover Plan

1. **Before cutover**: Set DNS TTL to 60 seconds (reduces rollback impact).
2. **Cutover**: Update the Cloudflare A record from Hetzner server IP to K8s LoadBalancer IP.
3. **Verify**: Monitor `kubectl get pods -n igbo` and Cloudflare Analytics for traffic.
4. **Post-cutover**: Keep old Hetzner server running for 24 hours as fallback.
5. **Confirm success**: After 24h stable operation, terminate old server.

---

## 7. Rollback Procedure

If issues arise during or after migration:

1. Revert Cloudflare DNS to the original Hetzner server IP.
2. Verify old server is still running (`docker compose -f docker-compose.prod.yml ps`).
3. Monitor `/api/v1/health` on old server to confirm it's healthy.
4. Investigate K8s issues before re-attempting cutover.

```bash
# Quick Cloudflare DNS rollback (using CF API)
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records/$CF_RECORD_ID" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"content":"<original-hetzner-ip>"}'
```

---

## Related Documentation

- [docs/cloudflare-setup.md](./cloudflare-setup.md) — CDN + DNS management
- [docs/hetzner-storage-setup.md](./hetzner-storage-setup.md) — Object Storage
- [docs/secrets-management.md](./secrets-management.md) — Secrets in K8s
