#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# OBIGBO Daily Backup Script
# Runs pg_dump and uploads to Hetzner Object Storage (S3-compatible)
# Logs structured JSON to stdout (captured by Docker logs)
# ─────────────────────────────────────────────────────────────────────────────

# Configure AWS CLI credentials via env vars (NOT config files)
export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-us-east-1}"

# Non-interactive pg_dump authentication
export PGPASSWORD="${POSTGRES_PASSWORD}"

TIMESTAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
BACKUP_FILE="/tmp/igbo-${TIMESTAMP}.dump"
S3_KEY="daily/${TIMESTAMP}.dump"

log_json() {
  local level="$1"
  shift
  printf '{"timestamp":"%s","level":"%s","context":"backup"%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "${level}" \
    "$*"
}

log_json "info" ',"message":"backup_started","file":"'"${S3_KEY}"'"'

# ─── Run pg_dump ───────────────────────────────────────────────────────────
# -Fc = custom format with built-in zlib compression (DO NOT pipe through gzip)
if ! pg_dump -Fc \
    -h postgres \
    -U "${POSTGRES_USER}" \
    -d "${POSTGRES_DB}" \
    > "${BACKUP_FILE}"; then
  log_json "error" ',"message":"backup_failed","reason":"pg_dump_failed","file":"'"${S3_KEY}"'"'
  exit 1
fi

# ─── Validate dump file is non-empty (> 1KB) ──────────────────────────────
FILESIZE=$(wc -c < "${BACKUP_FILE}" 2>/dev/null || echo 0)
if [ "${FILESIZE}" -lt 1024 ]; then
  log_json "error" ',"message":"backup_failed","reason":"backup_empty_or_too_small","file":"'"${S3_KEY}"'","size_bytes":'"${FILESIZE}"
  rm -f "${BACKUP_FILE}"
  exit 1
fi

# ─── Upload to S3 ─────────────────────────────────────────────────────────
if ! aws s3 cp "${BACKUP_FILE}" \
    "s3://${BACKUP_S3_BUCKET}/${S3_KEY}" \
    --endpoint-url "${BACKUP_S3_ENDPOINT}"; then
  log_json "error" ',"message":"backup_failed","reason":"s3_upload_failed","file":"'"${S3_KEY}"'"'
  rm -f "${BACKUP_FILE}"
  exit 1
fi

# ─── Verify upload succeeded (object exists in S3) ────────────────────────
if ! aws s3 ls "s3://${BACKUP_S3_BUCKET}/${S3_KEY}" \
    --endpoint-url "${BACKUP_S3_ENDPOINT}" > /dev/null 2>&1; then
  log_json "error" ',"message":"backup_failed","reason":"s3_verify_failed","file":"'"${S3_KEY}"'"'
  rm -f "${BACKUP_FILE}"
  exit 1
fi

# ─── Cleanup local temp file ──────────────────────────────────────────────
rm -f "${BACKUP_FILE}"

log_json "info" ',"message":"backup_completed","file":"'"${S3_KEY}"'","size_bytes":'"${FILESIZE}"
