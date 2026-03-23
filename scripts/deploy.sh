#!/usr/bin/env bash
# deploy.sh — Deploy, health-check, and automatic rollback
#
# Usage:
#   deploy.sh <compose-file> <health-url> <web-image> <realtime-image> [prev-web-image] [prev-realtime-image]
#
# Arguments:
#   compose-file        Path to docker-compose file (e.g. ~/docker-compose.prod.yml)
#   health-url          Full URL to /api/health endpoint (e.g. https://staging.example.com/api/health)
#   web-image           Full GHCR image ref to deploy (e.g. ghcr.io/owner/igbo-web:sha-abc1234)
#   realtime-image      Full GHCR image ref to deploy (e.g. ghcr.io/owner/igbo-realtime:sha-abc1234)
#   prev-web-image      Full image ref of currently running web container (for rollback)
#   prev-realtime-image Full image ref of currently running realtime container (for rollback)
#
# The script exports WEB_IMAGE and REALTIME_IMAGE env vars so docker-compose.prod.yml
# resolves its `image: ${WEB_IMAGE}` / `image: ${REALTIME_IMAGE}` fields to the GHCR refs.
#
# Health check: asserts BOTH HTTP 200 AND {"status":"healthy"} in body.
# A "degraded" response (HTTP 200, realtime down) is treated as a failed deploy.
#
# Exit codes:
#   0 — Deployment successful, health check passed
#   1 — Deployment failed (health check never passed); rollback attempted if prev tags given

set -euo pipefail

COMPOSE_FILE="${1:?Usage: deploy.sh <compose-file> <health-url> <web-image> <realtime-image> [prev-web-image] [prev-realtime-image]}"
HEALTH_URL="${2:?Usage: deploy.sh <compose-file> <health-url> <web-image> <realtime-image> [prev-web-image] [prev-realtime-image]}"
NEW_WEB_IMAGE="${3:?Usage: deploy.sh <compose-file> <health-url> <web-image> <realtime-image> [prev-web-image] [prev-realtime-image]}"
NEW_REALTIME_IMAGE="${4:?Usage: deploy.sh <compose-file> <health-url> <web-image> <realtime-image> [prev-web-image] [prev-realtime-image]}"
PREV_WEB_IMAGE="${5:-}"
PREV_REALTIME_IMAGE="${6:-}"

MAX_ATTEMPTS=5
WAIT_INTERVAL=10

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [deploy.sh] $*"; }

# ─── Health check function ───────────────────────────────────────────────────
# Returns 0 if status == "healthy", 1 otherwise
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

      if [ "$STATUS" = "healthy" ]; then
        log "Health check passed (status=healthy)."
        return 0
      fi

      log "Health check returned status='${STATUS}' (expected 'healthy')"
    else
      log "Health check request failed — no response from ${url}"
    fi
  done

  return 1
}

# ─── Deploy ──────────────────────────────────────────────────────────────────

log "Deploying web=$NEW_WEB_IMAGE, realtime=$NEW_REALTIME_IMAGE"

# Export image refs so docker-compose.prod.yml resolves image: ${WEB_IMAGE} / ${REALTIME_IMAGE}
export WEB_IMAGE="$NEW_WEB_IMAGE"
export REALTIME_IMAGE="$NEW_REALTIME_IMAGE"

log "Pulling images from registry..."
docker compose -f "$COMPOSE_FILE" pull

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

if [ -n "$PREV_WEB_IMAGE" ] && [ -n "$PREV_REALTIME_IMAGE" ]; then
  log "Initiating rollback → web: $PREV_WEB_IMAGE, realtime: $PREV_REALTIME_IMAGE"

  # Set image refs to previous versions
  export WEB_IMAGE="$PREV_WEB_IMAGE"
  export REALTIME_IMAGE="$PREV_REALTIME_IMAGE"

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
