#!/usr/bin/env bash
# deploy.sh — Deploy, health-check, and automatic rollback
#
# Usage:
#   deploy.sh <compose-file> <health-url> <web-image> <realtime-image> <portal-image> [prev-web-image] [prev-realtime-image] [prev-portal-image]
#
# Arguments:
#   compose-file        Path to docker-compose file (e.g. ~/docker-compose.prod.yml)
#   health-url          Full URL to /api/health endpoint (e.g. https://staging.example.com/api/health)
#   web-image           Full GHCR image ref to deploy (e.g. ghcr.io/owner/igbo-web:sha-abc1234)
#   realtime-image      Full GHCR image ref to deploy (e.g. ghcr.io/owner/igbo-realtime:sha-abc1234)
#   portal-image        Full GHCR image ref to deploy (e.g. ghcr.io/owner/igbo-portal:sha-abc1234)
#   prev-web-image      Full image ref of currently running web container (for rollback)
#   prev-realtime-image Full image ref of currently running realtime container (for rollback)
#   prev-portal-image   Full image ref of currently running portal container (for rollback)
#
# The script exports WEB_IMAGE, REALTIME_IMAGE, and PORTAL_IMAGE env vars so docker-compose.prod.yml
# resolves its image: fields to the GHCR refs.
#
# Health check: asserts BOTH HTTP 200 AND {"status":"ok"} in body.
# A "degraded" response (HTTP 200, DB/Redis down) is treated as a failed deploy.
#
# Exit codes:
#   0 — Deployment successful, health check passed
#   1 — Deployment failed (health check never passed); rollback attempted if prev tags given

set -euo pipefail

COMPOSE_FILE="${1:?Usage: deploy.sh <compose-file> <health-url> <web-image> <realtime-image> <portal-image> [prev-web-image] [prev-realtime-image] [prev-portal-image]}"
HEALTH_URL="${2:?Usage: deploy.sh <compose-file> <health-url> <web-image> <realtime-image> <portal-image> [prev-web-image] [prev-realtime-image] [prev-portal-image]}"
NEW_WEB_IMAGE="${3:?Usage: deploy.sh <compose-file> <health-url> <web-image> <realtime-image> <portal-image> [prev-web-image] [prev-realtime-image] [prev-portal-image]}"
NEW_REALTIME_IMAGE="${4:?Usage: deploy.sh <compose-file> <health-url> <web-image> <realtime-image> <portal-image> [prev-web-image] [prev-realtime-image] [prev-portal-image]}"
NEW_PORTAL_IMAGE="${5:?Usage: deploy.sh <compose-file> <health-url> <web-image> <realtime-image> <portal-image> [prev-web-image] [prev-realtime-image] [prev-portal-image]}"
PREV_WEB_IMAGE="${6:-}"
PREV_REALTIME_IMAGE="${7:-}"
PREV_PORTAL_IMAGE="${8:-}"

MAX_ATTEMPTS=5
WAIT_INTERVAL=10

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [deploy.sh] $*"; }

# ─── Health check function ───────────────────────────────────────────────────
# Returns 0 if status == "ok", 1 otherwise
check_health() {
  local url="$1"
  local attempts="${2:-$MAX_ATTEMPTS}"
  local interval="${3:-$WAIT_INTERVAL}"

  for i in $(seq 1 "$attempts"); do
    log "Health check attempt $i/$attempts — sleeping ${interval}s..."
    sleep "$interval"

    RESPONSE=$(curl -sf "$url" 2>/dev/null || echo "")

    if [ -n "$RESPONSE" ]; then
      STATUS=$(echo "$RESPONSE" | \
        python3 -c "import sys, json; print(json.load(sys.stdin).get('status', ''))" \
        2>/dev/null || echo "")

      if [ "$STATUS" = "ok" ]; then
        log "Health check passed (status=ok)."
        return 0
      fi

      log "Health check returned status='${STATUS}' (expected 'ok')"
    else
      log "Health check request failed — no response from ${url}"
    fi
  done

  return 1
}

# ─── Deploy ──────────────────────────────────────────────────────────────────

log "Deploying web=$NEW_WEB_IMAGE, realtime=$NEW_REALTIME_IMAGE, portal=$NEW_PORTAL_IMAGE"

# Export image refs so docker-compose.prod.yml resolves image: ${WEB_IMAGE} / ${REALTIME_IMAGE} / ${PORTAL_IMAGE}
export WEB_IMAGE="$NEW_WEB_IMAGE"
export REALTIME_IMAGE="$NEW_REALTIME_IMAGE"
export PORTAL_IMAGE="$NEW_PORTAL_IMAGE"

log "Pulling images from registry..."
docker compose -f "$COMPOSE_FILE" pull

# ─── Ensure postgres is running before migrations ────────────────────────────
# On first deploy or after a rollback, postgres may not be running yet.
# Start only infra services (postgres + redis) — not the app containers.
log "Ensuring postgres is running..."
docker compose -f "$COMPOSE_FILE" up -d postgres redis

# Wait for postgres to be healthy (configurable, default 60s)
PG_WAIT_ATTEMPTS="${PG_WAIT_ATTEMPTS:-30}"
PG_READY=false
for i in $(seq 1 "$PG_WAIT_ATTEMPTS"); do
  if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -q 2>/dev/null; then
    log "Postgres is ready."
    PG_READY=true
    break
  fi
  log "Waiting for postgres... attempt $i/$PG_WAIT_ATTEMPTS"
  sleep 2
done

if [ "$PG_READY" = "false" ]; then
  log "ERROR: Postgres did not become ready after $((PG_WAIT_ATTEMPTS * 2))s. Aborting deploy."
  MIGRATION_FAILED=true
fi

# ─── Run database migrations BEFORE starting application containers ─────────
# Uses a one-shot container from the new web image (which ships SQL files).
# Runs against the already-running postgres service. Migrations are idempotent
# (IF NOT EXISTS / DO $$ guards) so re-running is safe.
# CRITICAL: Migration failure aborts the deploy and triggers rollback.
# Only run migrations if postgres is ready
if [ "${MIGRATION_FAILED:-false}" = "false" ]; then
  log "Running database migrations..."
  # `docker compose run` inherits env_file (.env) from the web service definition,
  # which provides POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB.
  # Migrations are sorted explicitly (not relying on filesystem glob order).
  if ! docker compose -f "$COMPOSE_FILE" run --rm -T --no-deps \
    --entrypoint sh web -c \
    ': "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD not set}"
     export PGPASSWORD="${POSTGRES_PASSWORD}"
     FAIL=0
     for f in $(ls packages/db/src/migrations/*.sql | sort); do
       echo "[migrate] Applying: $f"
       if psql \
         -h "${DB_HOST:-postgres}" \
         -U "${POSTGRES_USER:-igbo}" \
         -d "${POSTGRES_DB:-igbo}" \
         -v ON_ERROR_STOP=1 \
         -f "$f" 2>&1; then
         echo "[migrate] SUCCESS: $f"
       else
         echo "[migrate] ERROR: Failed on $f"
         FAIL=1
         break
       fi
     done
     exit $FAIL'; then
    log "ERROR: Database migration failed. Aborting deploy."
    MIGRATION_FAILED=true
  fi
fi

if [ "${MIGRATION_FAILED:-false}" = "true" ]; then
  # Trigger rollback if previous images are available
  if [ -n "$PREV_WEB_IMAGE" ] && [ -n "$PREV_REALTIME_IMAGE" ] && [ -n "$PREV_PORTAL_IMAGE" ]; then
    log "Initiating rollback due to migration failure → web: $PREV_WEB_IMAGE, realtime: $PREV_REALTIME_IMAGE, portal: $PREV_PORTAL_IMAGE"
    export WEB_IMAGE="$PREV_WEB_IMAGE"
    export REALTIME_IMAGE="$PREV_REALTIME_IMAGE"
    export PORTAL_IMAGE="$PREV_PORTAL_IMAGE"
    docker compose -f "$COMPOSE_FILE" pull 2>/dev/null || \
      log "Warning: Could not pull previous images — using local cached images"
    docker compose -f "$COMPOSE_FILE" up -d
    if check_health "$HEALTH_URL" 3 10; then
      log "Rollback successful after migration failure."
    else
      log "CRITICAL: Rollback health check also failed. Manual intervention required."
    fi
  else
    log "WARNING: No previous image tags — cannot rollback. Manual intervention required."
  fi
  exit 1
fi

log "Starting containers..."
docker compose -f "$COMPOSE_FILE" up -d

# ─── Health check ────────────────────────────────────────────────────────────

log "Running health checks (${MAX_ATTEMPTS} attempts, ${WAIT_INTERVAL}s apart)..."

if check_health "$HEALTH_URL"; then
  log "Deployment successful."
  exit 0
fi

log "ERROR: Health check failed after ${MAX_ATTEMPTS} attempts."

# ─── Rollback ─────────────────────────────────────────────────────────────────

if [ -n "$PREV_WEB_IMAGE" ] && [ -n "$PREV_REALTIME_IMAGE" ] && [ -n "$PREV_PORTAL_IMAGE" ]; then
  log "Initiating rollback → web: $PREV_WEB_IMAGE, realtime: $PREV_REALTIME_IMAGE, portal: $PREV_PORTAL_IMAGE"

  # Set image refs to previous versions
  export WEB_IMAGE="$PREV_WEB_IMAGE"
  export REALTIME_IMAGE="$PREV_REALTIME_IMAGE"
  export PORTAL_IMAGE="$PREV_PORTAL_IMAGE"

  # Pull previous images from registry (fall back to local cache if unavailable)
  docker compose -f "$COMPOSE_FILE" pull 2>/dev/null || \
    log "Warning: Could not pull previous images — using local cached images"

  # Restart containers with previous images
  docker compose -f "$COMPOSE_FILE" up -d

  # Verify rollback health (fewer attempts — previous version should be known-good)
  if check_health "$HEALTH_URL" 3 10; then
    log "Rollback successful. Previous versions restored and healthy."
  else
    log "CRITICAL: Rollback health check also failed. Manual intervention required."
  fi
else
  log "WARNING: No previous image tags provided — skipping rollback. Manual intervention required."
fi

# Always exit with failure so the CI pipeline reports the deployment as failed
exit 1
