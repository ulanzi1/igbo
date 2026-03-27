#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# OBIGBO Physical Base Backup Script (pg_basebackup)
# Creates a physical base backup required for WAL-based point-in-time recovery.
# Runs weekly (Sunday 3:00 AM UTC) alongside daily pg_dump logical backups.
# The physical backup + WAL archive enables PITR with ~5-minute RPO.
# ─────────────────────────────────────────────────────────────────────────────

export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-us-east-1}"
export PGPASSWORD="${POSTGRES_PASSWORD}"

DB_HOST="${DB_HOST:-postgres}"
TIMESTAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
BASE_BACKUP_DIR="/tmp/basebackup-${TIMESTAMP}"
ARCHIVE_FILE="/tmp/basebackup-${TIMESTAMP}.tar.gz"
S3_KEY="base-backups/${TIMESTAMP}.tar.gz"

log_json() {
  local level="$1"
  shift
  printf '{"timestamp":"%s","level":"%s","context":"base-backup"%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "${level}" \
    "$*"
}

log_json "info" ',"message":"base_backup_started","s3_key":"'"${S3_KEY}"'"'

# ─── Run pg_basebackup ────────────────────────────────────────────────────
# -Fp = plain format (directory of files)
# -Xs = stream WAL during backup (ensures consistent backup without archive_mode dependency)
# -P  = show progress
# -D  = target directory
if ! pg_basebackup \
    -h "${DB_HOST}" \
    -U "${POSTGRES_USER}" \
    -Fp \
    -Xs \
    -P \
    -D "${BASE_BACKUP_DIR}"; then
  log_json "error" ',"message":"base_backup_failed","reason":"pg_basebackup_failed"'
  rm -rf "${BASE_BACKUP_DIR}"
  exit 1
fi

# ─── Compress the backup directory ────────────────────────────────────────
if ! tar -czf "${ARCHIVE_FILE}" -C "$(dirname "${BASE_BACKUP_DIR}")" "$(basename "${BASE_BACKUP_DIR}")"; then
  log_json "error" ',"message":"base_backup_failed","reason":"compression_failed"'
  rm -rf "${BASE_BACKUP_DIR}" "${ARCHIVE_FILE}"
  exit 1
fi

rm -rf "${BASE_BACKUP_DIR}"

# ─── Validate archive is non-empty (> 1MB — physical backups are large) ──
FILESIZE=$(wc -c < "${ARCHIVE_FILE}" 2>/dev/null || echo 0)
if [ "${FILESIZE}" -lt 1048576 ]; then
  log_json "error" ',"message":"base_backup_failed","reason":"archive_too_small","size_bytes":'"${FILESIZE}"
  rm -f "${ARCHIVE_FILE}"
  exit 1
fi

# ─── Upload to S3 ─────────────────────────────────────────────────────────
if ! aws s3 cp "${ARCHIVE_FILE}" \
    "s3://${BACKUP_S3_BUCKET}/${S3_KEY}" \
    --endpoint-url "${BACKUP_S3_ENDPOINT}"; then
  log_json "error" ',"message":"base_backup_failed","reason":"s3_upload_failed"'
  rm -f "${ARCHIVE_FILE}"
  exit 1
fi

# ─── Verify upload ────────────────────────────────────────────────────────
if ! aws s3 ls "s3://${BACKUP_S3_BUCKET}/${S3_KEY}" \
    --endpoint-url "${BACKUP_S3_ENDPOINT}" > /dev/null 2>&1; then
  log_json "error" ',"message":"base_backup_failed","reason":"s3_verify_failed"'
  rm -f "${ARCHIVE_FILE}"
  exit 1
fi

rm -f "${ARCHIVE_FILE}"

log_json "info" ',"message":"base_backup_completed","s3_key":"'"${S3_KEY}"'","size_bytes":'"${FILESIZE}"
