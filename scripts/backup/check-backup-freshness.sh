#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# OBIGBO Backup Freshness Check Script
# Queries S3 for the most recent daily backup and alerts if older than 25 hours.
# Runs daily at 5:00 AM UTC (3 hours after the 2:00 AM backup).
# ─────────────────────────────────────────────────────────────────────────────

export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-us-east-1}"

log_json() {
  local level="$1"
  shift
  printf '{"timestamp":"%s","level":"%s","context":"backup-freshness"%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "${level}" \
    "$*"
}

# Max age threshold: 25 hours (in seconds)
MAX_AGE_SECONDS=$((25 * 3600))

# Get most recent backup's LastModified timestamp
LATEST_INFO=$(aws s3api list-objects-v2 \
  --bucket "${BACKUP_S3_BUCKET}" \
  --prefix "daily/" \
  --query "sort_by(Contents, &LastModified)[-1]" \
  --output json \
  --endpoint-url "${BACKUP_S3_ENDPOINT}" 2>/dev/null || echo "null")

if [ "${LATEST_INFO}" = "null" ] || [ -z "${LATEST_INFO}" ]; then
  log_json "error" ',"message":"backup_freshness_alert","reason":"no_backups_found_in_s3"'
  exit 1
fi

LATEST_KEY=$(echo "${LATEST_INFO}" | jq -r '.Key')
LATEST_MODIFIED=$(echo "${LATEST_INFO}" | jq -r '.LastModified')

# Calculate age in seconds
NOW_EPOCH=$(date -u +%s)
MODIFIED_EPOCH=$(date -u -d "${LATEST_MODIFIED}" +%s 2>/dev/null || \
  date -u -j -f "%Y-%m-%dT%H:%M:%S+00:00" "${LATEST_MODIFIED}" +%s 2>/dev/null || \
  echo 0)

AGE_SECONDS=$((NOW_EPOCH - MODIFIED_EPOCH))
AGE_HOURS=$((AGE_SECONDS / 3600))

if [ "${AGE_SECONDS}" -gt "${MAX_AGE_SECONDS}" ]; then
  log_json "error" ',"message":"backup_freshness_alert","reason":"backup_too_old","backup_key":"'"${LATEST_KEY}"'","age_hours":'"${AGE_HOURS}"',"threshold_hours":25'
  exit 1
fi

log_json "info" ',"message":"backup_freshness_ok","backup_key":"'"${LATEST_KEY}"'","age_hours":'"${AGE_HOURS}"
