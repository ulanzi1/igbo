#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# OBIGBO Restore Script — Full Recovery from Daily Backup
# DESTRUCTIVE: Drops and recreates the database. Requires explicit confirmation.
# Usage: restore.sh <backup_key|latest>
#   backup_key: S3 key e.g. "daily/2026-03-24T020000Z.dump"
#   latest:     auto-detect most recent backup
# ─────────────────────────────────────────────────────────────────────────────

export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-us-east-1}"
export PGPASSWORD="${POSTGRES_PASSWORD}"

DB_HOST="${DB_HOST:-postgres}"
RESTORE_FILE="/tmp/restore.dump"

log_json() {
  local level="$1"
  shift
  printf '{"timestamp":"%s","level":"%s","context":"restore"%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "${level}" \
    "$*"
}

BACKUP_ARG="${1:-latest}"

# ─── Resolve backup key ───────────────────────────────────────────────────
if [ "${BACKUP_ARG}" = "latest" ]; then
  echo "Looking up most recent backup in S3..."
  BACKUP_KEY=$(aws s3api list-objects-v2 \
    --bucket "${BACKUP_S3_BUCKET}" \
    --prefix "daily/" \
    --query "sort_by(Contents, &LastModified)[-1].Key" \
    --output text \
    --endpoint-url "${BACKUP_S3_ENDPOINT}")

  if [ -z "${BACKUP_KEY}" ] || [ "${BACKUP_KEY}" = "None" ]; then
    log_json "error" ',"message":"restore_failed","reason":"no_backups_found"'
    exit 1
  fi
  echo "Found latest backup: ${BACKUP_KEY}"
else
  BACKUP_KEY="${BACKUP_ARG}"
fi

# ─── Require explicit confirmation (destructive operation) ────────────────
echo ""
echo "=========================================================="
echo "  WARNING: DESTRUCTIVE OPERATION"
echo "  This will DROP and recreate the database."
echo "  Backup to restore: ${BACKUP_KEY}"
echo "  Target database:   ${POSTGRES_DB} on ${DB_HOST}"
echo "=========================================================="
echo ""
echo "Stop web + realtime containers before proceeding."
echo "  docker compose -f docker-compose.prod.yml stop web realtime"
echo ""
read -r -p "Type 'yes' to confirm and proceed: " CONFIRM

if [ "${CONFIRM}" != "yes" ]; then
  echo "Restore cancelled."
  exit 0
fi

RESTORE_START=$(date +%s)

log_json "info" ',"message":"restore_started","backup_key":"'"${BACKUP_KEY}"'"'

# ─── Download backup from S3 ─────────────────────────────────────────────
echo "Downloading backup from S3..."
aws s3 cp "s3://${BACKUP_S3_BUCKET}/${BACKUP_KEY}" "${RESTORE_FILE}" \
  --endpoint-url "${BACKUP_S3_ENDPOINT}"

# ─── Restore database ─────────────────────────────────────────────────────
# --clean --if-exists: drops existing objects before restoring
# skips errors for objects that don't exist (handles schema drift gracefully)
echo "Restoring database..."
pg_restore \
  -h "${DB_HOST}" \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --clean \
  --if-exists \
  "${RESTORE_FILE}"

# ─── Post-restore verification ────────────────────────────────────────────
echo "Running post-restore verification..."

TABLE_COUNT=$(psql -h "${DB_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -t -A \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")

USER_COUNT=$(psql -h "${DB_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -t -A \
  -c "SELECT count(*) FROM auth_users")

LATEST_RECORD=$(psql -h "${DB_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -t -A \
  -c "SELECT max(created_at) FROM auth_users")

# ─── Cleanup ──────────────────────────────────────────────────────────────
rm -f "${RESTORE_FILE}"

RESTORE_END=$(date +%s)
RESTORE_DURATION=$((RESTORE_END - RESTORE_START))

log_json "info" ',"message":"restore_completed","backup_key":"'"${BACKUP_KEY}"'","duration_seconds":'"${RESTORE_DURATION}"',"table_count":'"${TABLE_COUNT}"',"user_count":'"${USER_COUNT}"',"latest_record":"'"${LATEST_RECORD}"'"'

echo ""
echo "Restore completed in ${RESTORE_DURATION}s"
echo "Tables: ${TABLE_COUNT} | Users: ${USER_COUNT} | Latest record: ${LATEST_RECORD}"
echo ""
echo "Next steps:"
echo "  1. Start application containers:"
echo "     docker compose -f docker-compose.prod.yml up -d web realtime"
echo "  2. Verify health: curl https://your-domain/api/health"
echo "  3. Spot-check recent data in the application"
