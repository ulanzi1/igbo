#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# OBIGBO WAL Archive Script
# Called by PostgreSQL as archive_command: receives %p (source path) %f (filename)
# Runs INSIDE the PostgreSQL container — aws-cli must be installed there.
# CRITICAL: Must exit non-zero on any failure — PostgreSQL halts WAL recycling
# if archive_command fails, ensuring no data loss.
# ─────────────────────────────────────────────────────────────────────────────

WAL_PATH="$1"   # %p — absolute path to WAL segment file
WAL_FILENAME="$2"  # %f — WAL segment filename

export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-us-east-1}"

# If WAL archiving is disabled, exit 0 immediately (no-op).
# PostgreSQL treats exit 0 as successful archive — allows WAL recycling.
if [ "${ENABLE_WAL_ARCHIVING:-true}" != "true" ]; then
  exit 0
fi

S3_KEY="wal-archive/${WAL_FILENAME}"
MAX_RETRIES=3
RETRY_DELAY=5

log_json() {
  local level="$1"
  shift
  printf '{"timestamp":"%s","level":"%s","context":"wal-archive"%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "${level}" \
    "$*"
}

# ─── Upload with retry logic ──────────────────────────────────────────────
attempt=0
while [ ${attempt} -lt ${MAX_RETRIES} ]; do
  attempt=$((attempt + 1))

  if aws s3 cp "${WAL_PATH}" \
      "s3://${BACKUP_S3_BUCKET}/${S3_KEY}" \
      --endpoint-url "${BACKUP_S3_ENDPOINT}" > /dev/null 2>&1; then

    # Verify upload succeeded (confirmed object exists)
    if aws s3 ls "s3://${BACKUP_S3_BUCKET}/${S3_KEY}" \
        --endpoint-url "${BACKUP_S3_ENDPOINT}" > /dev/null 2>&1; then
      log_json "info" ',"message":"wal_archived","file":"'"${WAL_FILENAME}"'","attempt":'"${attempt}"
      exit 0
    fi
  fi

  if [ ${attempt} -lt ${MAX_RETRIES} ]; then
    log_json "warn" ',"message":"wal_archive_retry","file":"'"${WAL_FILENAME}"'","attempt":'"${attempt}"',"retry_in":'"${RETRY_DELAY}"
    sleep ${RETRY_DELAY}
  fi
done

# All retries exhausted — exit non-zero so PostgreSQL does NOT recycle this WAL segment
log_json "error" ',"message":"wal_archive_failed","file":"'"${WAL_FILENAME}"'","attempts":'"${MAX_RETRIES}"
exit 1
