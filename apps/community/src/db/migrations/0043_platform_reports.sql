-- Migration 0043: platform_reports
-- Member reporting system — Story 11.2

CREATE TYPE "report_content_type" AS ENUM ('post', 'comment', 'message', 'member', 'article');
CREATE TYPE "report_reason_category" AS ENUM ('harassment', 'spam', 'inappropriate_content', 'misinformation', 'impersonation', 'other');
CREATE TYPE "report_status" AS ENUM ('pending', 'reviewed', 'resolved', 'dismissed');

CREATE TABLE "platform_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reporter_id" uuid NOT NULL REFERENCES "auth_users"("id") ON DELETE CASCADE,
  "content_type" "report_content_type" NOT NULL,
  "content_id" text NOT NULL,
  "reason_category" "report_reason_category" NOT NULL,
  "reason_text" text,
  "status" "report_status" NOT NULL DEFAULT 'pending',
  "reviewed_by" uuid REFERENCES "auth_users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "idx_platform_reports_unique" ON "platform_reports" ("reporter_id", "content_type", "content_id");
