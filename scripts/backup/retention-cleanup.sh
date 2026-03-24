#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# OBIGBO Backup Retention Cleanup Script
# Deletes backups older than 30 days from S3 (daily/ and wal-archive/ prefixes)
# ─────────────────────────────────────────────────────────────────────────────

export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-us-east-1}"

log_json() {
  local level="$1"
  shift
  printf '{"timestamp":"%s","level":"%s","context":"retention-cleanup"%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "${level}" \
    "$*"
}

# Calculate cutoff date (GNU date / BSD date compatible)
CUTOFF=$(date -u -d "30 days ago" +%Y-%m-%d 2>/dev/null || date -u -v-30d +%Y-%m-%d)

log_json "info" ',"message":"retention_cleanup_started","cutoff":"'"${CUTOFF}"'"'

deleted_count=0
retained_count=0

# ─── Clean daily/ backups ─────────────────────────────────────────────────
# Handle S3 listing pagination with list-objects-v2
KEYS=$(aws s3api list-objects-v2 \
  --bucket "${BACKUP_S3_BUCKET}" \
  --prefix "daily/" \
  --query "Contents[].Key" \
  --output text \
  --endpoint-url "${BACKUP_S3_ENDPOINT}" 2>/dev/null || echo "")

for key in ${KEYS}; do
  # Extract date from key format: daily/YYYY-MM-DDTHHMMSSZ.dump
  filename=$(basename "${key}")
  # Date is first 10 chars: YYYY-MM-DD
  file_date="${filename:0:10}"

  if [[ "${file_date}" < "${CUTOFF}" ]]; then
    aws s3 rm "s3://${BACKUP_S3_BUCKET}/${key}" \
      --endpoint-url "${BACKUP_S3_ENDPOINT}" > /dev/null
    deleted_count=$((deleted_count + 1))
  else
    retained_count=$((retained_count + 1))
  fi
done

# ─── Clean wal-archive/ segments older than 30 days ───────────────────────
# WAL filenames don't embed date — use S3 LastModified via list-objects-v2 JSON
WAL_JSON=$(aws s3api list-objects-v2 \
  --bucket "${BACKUP_S3_BUCKET}" \
  --prefix "wal-archive/" \
  --query "Contents[?LastModified<='${CUTOFF}T00:00:00Z'].Key" \
  --output text \
  --endpoint-url "${BACKUP_S3_ENDPOINT}" 2>/dev/null || echo "")

wal_deleted=0
for key in ${WAL_JSON}; do
  aws s3 rm "s3://${BACKUP_S3_BUCKET}/${key}" \
    --endpoint-url "${BACKUP_S3_ENDPOINT}" > /dev/null
  wal_deleted=$((wal_deleted + 1))
done

log_json "info" ',"message":"retention_cleanup_completed","daily_deleted":'"${deleted_count}"',"daily_retained":'"${retained_count}"',"wal_deleted":'"${wal_deleted}"
