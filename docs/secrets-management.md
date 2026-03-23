# Production Secrets Management

This document describes how production secrets are managed for the OBIGBO platform,
covering the single-server Hetzner deployment and the Kubernetes migration path.

---

## 1. Single-Server Production (Current)

### 1.1 Storage

Production secrets are stored in a `.env` file on the Hetzner server:

```
/home/deploy/igbo/.env
```

This file is:

- **Never committed to version control** — `.env` is in `.gitignore`
- Loaded by Docker Compose via `env_file: .env` in `docker-compose.prod.yml`
- Owned by the `deploy` user with permissions `600` (`-rw-------`)
- The single source of truth for all production environment variables

### 1.2 T3 Env Validation

The application uses T3 Env (`src/env.ts`) to validate environment variables:

**Build-time validation (CI/CD):**

- `SKIP_ENV_VALIDATION=1` is set in `Dockerfile.web` builder stage.
- Server-only vars (DATABASE_URL, AUTH_SECRET, etc.) are **NOT** validated at build time.
- This is correct — server vars are runtime secrets, not available during Docker build.

**Runtime validation:**

- When the container starts, T3 Env validates all `server:` and `client:` variables.
- Missing required vars cause the application to exit immediately with a clear error.
- This fail-fast behaviour prevents a misconfigured instance from silently serving errors.

**Client vars at build time:**

- `NEXT_PUBLIC_*` vars ARE validated at build time (they're baked into the JS bundle).
- The CI workflow provides these via GitHub Actions secrets (configured in Story 12.1).

### 1.3 Setting Up the Production .env File

1. SSH into the Hetzner server:

   ```bash
   ssh deploy@<server-ip>
   ```

2. Navigate to the deploy directory:

   ```bash
   cd /home/deploy/igbo
   ```

3. Copy the example template:

   ```bash
   cp .env.production.example .env
   ```

4. Edit the file and replace all placeholder values:

   ```bash
   nano .env   # or vim .env
   ```

5. Set correct file permissions:

   ```bash
   chmod 600 .env
   ```

6. Verify Docker Compose picks up the vars:
   ```bash
   docker compose -f docker-compose.prod.yml config | grep DATABASE_URL
   ```

### 1.4 Rotating Secrets

To rotate a secret (e.g., `AUTH_SECRET`):

1. Generate a new value:

   ```bash
   openssl rand -base64 32
   ```

2. Update `.env` on the server with the new value.

3. Restart the affected container:

   ```bash
   docker compose -f docker-compose.prod.yml up -d --no-deps web
   ```

4. Monitor logs for errors:
   ```bash
   docker compose -f docker-compose.prod.yml logs -f web --tail=50
   ```

> **Session invalidation warning:** Rotating `AUTH_SECRET` invalidates all active user sessions.
> Plan rotation for a low-traffic period and notify users if needed.

---

## 2. GitHub Actions Secrets (CI/CD)

Secrets used during CI/CD (builds, deployments) are stored in GitHub repository secrets.
These were configured in Story 12.1. Key secrets:

| Secret name                | Purpose                                   |
| -------------------------- | ----------------------------------------- |
| `DEPLOY_SSH_KEY`           | SSH private key for Hetzner server access |
| `DEPLOY_HOST`              | Hetzner server IP/hostname                |
| `DEPLOY_USER`              | SSH user (`deploy`)                       |
| `NEXT_PUBLIC_APP_URL`      | Baked into Next.js bundle at build time   |
| `NEXT_PUBLIC_REALTIME_URL` | Baked into Next.js bundle at build time   |
| `HETZNER_S3_ENDPOINT`      | Used for Docker build args                |
| `HETZNER_S3_PUBLIC_URL`    | Used for Docker build args                |
| `REGISTRY_TOKEN`           | GHCR push token (GitHub Actions PAT)      |

Configure via: GitHub repository → Settings → Secrets and Variables → Actions.

---

## 3. Kubernetes Migration (Future)

When migrating to Kubernetes, secrets are managed via K8s Secrets:

### 3.1 Creating K8s Secrets

```bash
# Create a secret from the production .env file
kubectl create secret generic igbo-secrets \
  --from-env-file=.env \
  -n igbo

# Or create individual secrets
kubectl create secret generic igbo-secrets \
  --from-literal=AUTH_SECRET=<value> \
  --from-literal=DATABASE_URL=<value> \
  --from-literal=REDIS_URL=<value> \
  -n igbo
```

### 3.2 Injecting Secrets into Pods

The Helm chart and K8s manifests reference the `igbo-secrets` secret via `secretRef`:

```yaml
envFrom:
  - configMapRef:
      name: igbo-config # non-sensitive config
  - secretRef:
      name: igbo-secrets # all secrets from .env
```

### 3.3 Secret Rotation in Kubernetes

1. Update the K8s secret:

   ```bash
   kubectl create secret generic igbo-secrets \
     --from-env-file=.env \
     -n igbo \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

2. Trigger a rolling restart to pick up the new secret:
   ```bash
   kubectl rollout restart deployment/igbo-web -n igbo
   kubectl rollout status deployment/igbo-web -n igbo
   ```

### 3.4 External Secrets (Advanced)

For production-grade secret management, consider:

- [External Secrets Operator](https://external-secrets.io/) — sync secrets from Vault, AWS SSM, or 1Password into K8s Secrets
- Hetzner Cloud does not provide a native secrets manager — use Vault or external providers

---

## 4. What Must NEVER Be Committed

The following must **never** appear in git:

- `.env` — production secrets
- `.env.local` — local overrides
- `.env.production` — production overrides (use `.env.production.example` instead)
- Any file with real API keys, passwords, or tokens
- Private keys (SSH, VAPID, TLS certificates)

The `.gitignore` already excludes `.env*` (except `.env.example` and `.env.production.example`).

---

## 5. Reference: All Required Production Variables

See `.env.production.example` at the project root for a complete annotated list of all
required production environment variables.

---

## Related Documentation

- [docs/hetzner-storage-setup.md](./hetzner-storage-setup.md) — Object Storage credentials
- [docs/kubernetes-migration.md](./kubernetes-migration.md) — K8s secrets management
- [.env.production.example](../.env.production.example) — Complete production env template
