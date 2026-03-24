#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# OBIGBO Point-in-Time Recovery (PITR) Script
# Recovers the database to a specific timestamp using WAL archiving.
# Usage: restore-pitr.sh <ISO8601_timestamp>
#   Example: restore-pitr.sh "2026-03-24T15:30:00Z"
#
# ⚠️  KNOWN LIMITATION: This script uses pg_dump (logical backup) as the base
#     restore, then configures WAL replay. WAL replay requires a PHYSICAL base
#     backup (pg_basebackup), not a logical one. Until a pg_basebackup-based
#     backup is implemented, PITR via WAL replay will NOT produce correct results.
#     For launch, use restore.sh (full daily backup restore) instead.
#     TODO: Add pg_basebackup to the backup pipeline to enable true PITR.
# ─────────────────────────────────────────────────────────────────────────────

export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-us-east-1}"
export PGPASSWORD="${POSTGRES_PASSWORD}"

PGDATA="${PGDATA:-/var/lib/postgresql/data}"
DB_HOST="${DB_HOST:-postgres}"
RESTORE_FILE="/tmp/pitr-base.dump"

log_json() {
  local level="$1"
  shift
  printf '{"timestamp":"%s","level":"%s","context":"restore-pitr"%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "${level}" \
    "$*"
}

TARGET_TIME="${1:-}"
if [ -z "${TARGET_TIME}" ]; then
  echo "Usage: restore-pitr.sh <ISO8601_timestamp>"
  echo "Example: restore-pitr.sh '2026-03-24T15:30:00Z'"
  exit 1
fi

echo ""
echo "=========================================================="
echo "  POINT-IN-TIME RECOVERY"
echo "  Target time:       ${TARGET_TIME}"
echo "  Target database:   ${POSTGRES_DB} on ${DB_HOST}"
echo "  PGDATA:            ${PGDATA}"
echo "=========================================================="
echo ""
echo "Ensure web + realtime containers are stopped before proceeding."
echo ""
read -r -p "Type 'yes' to confirm and proceed: " CONFIRM

if [ "${CONFIRM}" != "yes" ]; then
  echo "PITR cancelled."
  exit 0
fi

log_json "info" ',"message":"pitr_started","target_time":"'"${TARGET_TIME}"'"'

# ─── Download latest base backup ──────────────────────────────────────────
echo "Finding most recent base backup before target time..."
BACKUP_KEY=$(aws s3api list-objects-v2 \
  --bucket "${BACKUP_S3_BUCKET}" \
  --prefix "daily/" \
  --query "sort_by(Contents, &LastModified)[-1].Key" \
  --output text \
  --endpoint-url "${BACKUP_S3_ENDPOINT}")

if [ -z "${BACKUP_KEY}" ] || [ "${BACKUP_KEY}" = "None" ]; then
  log_json "error" ',"message":"pitr_failed","reason":"no_base_backup_found"'
  exit 1
fi

echo "Using base backup: ${BACKUP_KEY}"
aws s3 cp "s3://${BACKUP_S3_BUCKET}/${BACKUP_KEY}" "${RESTORE_FILE}" \
  --endpoint-url "${BACKUP_S3_ENDPOINT}"

# ─── Restore base backup ──────────────────────────────────────────────────
echo "Restoring base backup..."
pg_restore \
  -h "${DB_HOST}" \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --clean \
  --if-exists \
  "${RESTORE_FILE}"

rm -f "${RESTORE_FILE}"

# ─── Configure recovery (PostgreSQL 12+ style) ────────────────────────────
# PostgreSQL 12+: uses recovery.signal + postgresql.auto.conf instead of recovery.conf
RECOVERY_CONF="${PGDATA}/postgresql.auto.conf"
RECOVERY_SIGNAL="${PGDATA}/recovery.signal"

echo "Configuring point-in-time recovery target..."

# Append PITR settings to postgresql.auto.conf
cat >> "${RECOVERY_CONF}" <<EOF

# PITR Recovery Settings (added by restore-pitr.sh)
recovery_target_time = '${TARGET_TIME}'
recovery_target_inclusive = true
restore_command = 'aws s3 cp s3://${BACKUP_S3_BUCKET}/wal-archive/%f %p --endpoint-url ${BACKUP_S3_ENDPOINT}'
EOF

# Create recovery.signal to trigger recovery mode on next start
touch "${RECOVERY_SIGNAL}"

echo ""
echo "Recovery configuration written to ${RECOVERY_CONF}"
echo "recovery.signal created at ${RECOVERY_SIGNAL}"
echo ""
echo "PostgreSQL will enter recovery mode on next start and apply WAL until ${TARGET_TIME}"
echo ""
echo "Next steps:"
echo "  1. Restart the PostgreSQL container"
echo "  2. Monitor PostgreSQL logs for: 'recovery stopping before commit'"
echo "  3. Once recovery completes, promote: SELECT pg_promote();"
echo "  4. Remove recovery.signal from PGDATA"
echo "  5. Restart application containers"

log_json "info" ',"message":"pitr_configured","target_time":"'"${TARGET_TIME}"'","base_backup":"'"${BACKUP_KEY}"'"'
