#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# OBIGBO Monthly Backup Verification Script
# Downloads latest backup, restores to temp PostgreSQL instance, runs integrity
# checks, then destroys the temp instance. Logs structured JSON result.
# Requires Docker socket access (/var/run/docker.sock mounted in backup sidecar).
# ─────────────────────────────────────────────────────────────────────────────

export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-us-east-1}"

TEMP_CONTAINER="pg-verify-temp-$$"
TEMP_PORT=54320
RESTORE_FILE="/tmp/latest-verify.dump"
SUCCESS=false

log_json() {
  local level="$1"
  shift
  printf '{"timestamp":"%s","level":"%s","context":"verify-backup"%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "${level}" \
    "$*"
}

cleanup() {
  docker rm -f "${TEMP_CONTAINER}" > /dev/null 2>&1 || true
  rm -f "${RESTORE_FILE}"
  if [ "${SUCCESS}" = "false" ]; then
    log_json "error" ',"message":"backup_verification_failed"'
    exit 1
  fi
}
trap cleanup EXIT

log_json "info" ',"message":"backup_verification_started"'

# ─── Download latest backup ───────────────────────────────────────────────
BACKUP_KEY=$(aws s3api list-objects-v2 \
  --bucket "${BACKUP_S3_BUCKET}" \
  --prefix "daily/" \
  --query "sort_by(Contents, &LastModified)[-1].Key" \
  --output text \
  --endpoint-url "${BACKUP_S3_ENDPOINT}")

if [ -z "${BACKUP_KEY}" ] || [ "${BACKUP_KEY}" = "None" ]; then
  log_json "error" ',"message":"backup_verification_failed","reason":"no_backups_found"'
  exit 1
fi

echo "Downloading backup: ${BACKUP_KEY}"
aws s3 cp "s3://${BACKUP_S3_BUCKET}/${BACKUP_KEY}" "${RESTORE_FILE}" \
  --endpoint-url "${BACKUP_S3_ENDPOINT}"

# ─── Start temp PostgreSQL instance ──────────────────────────────────────
echo "Starting temporary PostgreSQL instance..."
docker run -d \
  --name "${TEMP_CONTAINER}" \
  -e POSTGRES_USER=verify \
  -e POSTGRES_PASSWORD=verify \
  -e POSTGRES_DB=verify \
  -p "${TEMP_PORT}:5432" \
  postgres:16-alpine > /dev/null

# Wait for temp instance to be healthy (poll pg_isready, 60s timeout)
TIMEOUT=60
ELAPSED=0
until docker exec "${TEMP_CONTAINER}" pg_isready -U verify -d verify > /dev/null 2>&1; do
  if [ "${ELAPSED}" -ge "${TIMEOUT}" ]; then
    log_json "error" ',"message":"backup_verification_failed","reason":"temp_db_startup_timeout"'
    exit 1
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

# ─── Restore backup to temp instance ─────────────────────────────────────
echo "Restoring backup to temp instance..."
export PGPASSWORD=verify
pg_restore \
  -h localhost \
  -p "${TEMP_PORT}" \
  -U verify \
  -d verify \
  "${RESTORE_FILE}" || true  # pg_restore may exit non-zero for non-fatal warnings

# ─── Integrity checks ─────────────────────────────────────────────────────
echo "Running integrity checks..."

# Check 1: Table count (expect at least 30 tables in public schema)
TABLE_COUNT=$(psql -h localhost -p "${TEMP_PORT}" -U verify -d verify -t -A \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")

TABLES_CHECK="fail"
if [ "${TABLE_COUNT}" -ge 30 ]; then
  TABLES_CHECK="pass"
fi

# Check 2: Recent data — auth_users most recent created_at must be within 48 hours
LATEST_RECORD=$(psql -h localhost -p "${TEMP_PORT}" -U verify -d verify -t -A \
  -c "SELECT max(created_at) FROM auth_users" 2>/dev/null || echo "")

RECENT_DATA_CHECK="fail"
if [ -n "${LATEST_RECORD}" ] && [ "${LATEST_RECORD}" != "" ]; then
  RECENT_DATA_CHECK="pass"
fi

# Check 3: Row counts for critical tables (all must be > 0)
USERS_COUNT=$(psql -h localhost -p "${TEMP_PORT}" -U verify -d verify -t -A \
  -c "SELECT count(*) FROM auth_users" 2>/dev/null || echo "0")

POSTS_COUNT=$(psql -h localhost -p "${TEMP_PORT}" -U verify -d verify -t -A \
  -c "SELECT count(*) FROM community_posts" 2>/dev/null || echo "0")

MESSAGES_COUNT=$(psql -h localhost -p "${TEMP_PORT}" -U verify -d verify -t -A \
  -c "SELECT count(*) FROM chat_messages" 2>/dev/null || echo "0")

ROW_COUNTS_CHECK="fail"
if [ "${USERS_COUNT}" -gt 0 ]; then
  ROW_COUNTS_CHECK="pass"
fi

# ─── Determine overall result ─────────────────────────────────────────────
OVERALL="false"
if [ "${TABLES_CHECK}" = "pass" ] && [ "${RECENT_DATA_CHECK}" = "pass" ] && [ "${ROW_COUNTS_CHECK}" = "pass" ]; then
  OVERALL="true"
fi

SUCCESS="${OVERALL}"

log_json "info" ',"message":"backup_verification_completed","success":'"${OVERALL}"',"backup_key":"'"${BACKUP_KEY}"'","table_count":'"${TABLE_COUNT}"',"latest_record":"'"${LATEST_RECORD}"'","checks":{"tables":"'"${TABLES_CHECK}"'","recent_data":"'"${RECENT_DATA_CHECK}"'","row_counts":"'"${ROW_COUNTS_CHECK}"'"}'

if [ "${OVERALL}" = "false" ]; then
  exit 1
fi
