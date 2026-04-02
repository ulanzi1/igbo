-- Migration: 0009_gdpr_compliance
-- Story 1.13: GDPR Compliance & Data Privacy

-- 1. Add new account status enum values
ALTER TYPE "account_status" ADD VALUE IF NOT EXISTS 'PENDING_DELETION';
ALTER TYPE "account_status" ADD VALUE IF NOT EXISTS 'ANONYMIZED';

-- 2. Add scheduled_deletion_at column to auth_users
ALTER TABLE "auth_users"
ADD COLUMN IF NOT EXISTS "scheduled_deletion_at" TIMESTAMPTZ;

-- 3. Create gdpr_export_requests table
CREATE TABLE IF NOT EXISTS "gdpr_export_requests" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"        UUID NOT NULL REFERENCES "auth_users"("id") ON DELETE CASCADE,
  "status"         VARCHAR(20) NOT NULL DEFAULT 'pending',
  "download_token" VARCHAR(64) UNIQUE,
  "export_data"    JSONB,
  "expires_at"     TIMESTAMPTZ,
  "requested_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completed_at"   TIMESTAMPTZ,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "gdpr_export_requests_user_id_idx" ON "gdpr_export_requests"("user_id");
CREATE INDEX IF NOT EXISTS "gdpr_export_requests_token_idx" ON "gdpr_export_requests"("download_token") WHERE "download_token" IS NOT NULL;
