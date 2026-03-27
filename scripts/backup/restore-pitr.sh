#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# OBIGBO Point-in-Time Recovery (PITR) Script
# Recovers the database to a specific timestamp using physical base backup
# (pg_basebackup) + WAL replay.
# Usage: restore-pitr.sh <ISO8601_timestamp>
#   Example: restore-pitr.sh "2026-03-24T15:30:00Z"
#
# Prerequisites:
#   - A physical base backup must exist in s3://BUCKET/base-backups/
#     (created by base-backup.sh, runs weekly Sunday 3:00 AM UTC)
#   - WAL segments must be archived in s3://BUCKET/wal-archive/
#   - PostgreSQL and application containers must be stopped before running
# ─────────────────────────────────────────────────────────────────────────────

export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-us-east-1}"
export PGPASSWORD="${POSTGRES_PASSWORD}"

PGDATA="${PGDATA:-/var/lib/postgresql/data}"
RESTORE_ARCHIVE="/tmp/pitr-base.tar.gz"

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
echo "  POINT-IN-TIME RECOVERY (pg_basebackup + WAL replay)"
echo "  Target time:       ${TARGET_TIME}"
echo "  PGDATA:            ${PGDATA}"
echo "=========================================================="
echo ""
echo "WARNING: This will REPLACE the contents of PGDATA with the"
echo "physical base backup and replay WAL to the target time."
echo ""
echo "Ensure PostgreSQL, web, and realtime containers are STOPPED."
echo ""
read -r -p "Type 'yes' to confirm and proceed: " CONFIRM

if [ "${CONFIRM}" != "yes" ]; then
  echo "PITR cancelled."
  exit 0
fi

log_json "info" ',"message":"pitr_started","target_time":"'"${TARGET_TIME}"'"'

# ─── Download latest physical base backup before target time ──────────────
echo "Finding most recent physical base backup..."
BACKUP_KEY=$(aws s3api list-objects-v2 \
  --bucket "${BACKUP_S3_BUCKET}" \
  --prefix "base-backups/" \
  --query "sort_by(Contents, &LastModified)[-1].Key" \
  --output text \
  --endpoint-url "${BACKUP_S3_ENDPOINT}")

if [ -z "${BACKUP_KEY}" ] || [ "${BACKUP_KEY}" = "None" ]; then
  log_json "error" ',"message":"pitr_failed","reason":"no_base_backup_found"'
  echo ""
  echo "ERROR: No physical base backup found in s3://${BACKUP_S3_BUCKET}/base-backups/"
  echo "Run base-backup.sh first to create a pg_basebackup physical backup."
  exit 1
fi

echo "Using physical base backup: ${BACKUP_KEY}"
aws s3 cp "s3://${BACKUP_S3_BUCKET}/${BACKUP_KEY}" "${RESTORE_ARCHIVE}" \
  --endpoint-url "${BACKUP_S3_ENDPOINT}"

# ─── Replace PGDATA with physical backup ─────────────────────────────────
echo "Clearing existing PGDATA and extracting physical backup..."

# Safety: preserve pg_wal if it's on a separate volume (common in production)
if [ -L "${PGDATA}/pg_wal" ]; then
  WAL_LINK_TARGET=$(readlink -f "${PGDATA}/pg_wal")
  echo "pg_wal is a symlink to ${WAL_LINK_TARGET} — will preserve"
fi

# Remove existing data
rm -rf "${PGDATA:?}"/*

# Extract physical backup into PGDATA
tar -xzf "${RESTORE_ARCHIVE}" --strip-components=1 -C "${PGDATA}"
rm -f "${RESTORE_ARCHIVE}"

# Restore pg_wal symlink if it existed
if [ -n "${WAL_LINK_TARGET:-}" ]; then
  rm -rf "${PGDATA}/pg_wal"
  ln -s "${WAL_LINK_TARGET}" "${PGDATA}/pg_wal"
fi

# ─── Configure recovery (PostgreSQL 12+ style) ────────────────────────────
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
echo "Physical base backup restored to ${PGDATA}"
echo "Recovery configuration written to ${RECOVERY_CONF}"
echo "recovery.signal created at ${RECOVERY_SIGNAL}"
echo ""
echo "PostgreSQL will enter recovery mode on next start and replay WAL until ${TARGET_TIME}"
echo ""
echo "Next steps:"
echo "  1. Restart the PostgreSQL container"
echo "  2. Monitor PostgreSQL logs for: 'recovery stopping before commit'"
echo "  3. Once recovery completes, promote: SELECT pg_promote();"
echo "  4. Remove recovery.signal from PGDATA"
echo "  5. Restart application containers"

log_json "info" ',"message":"pitr_configured","target_time":"'"${TARGET_TIME}"'","base_backup":"'"${BACKUP_KEY}"'"'
