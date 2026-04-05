-- Migration: 0053_job_posting_expiry_archive
-- Add archived_at column and performance indexes for expiry/archive operations

ALTER TABLE "portal_job_postings" ADD COLUMN "archived_at" TIMESTAMPTZ;

-- Index for efficient expiry queries (find active postings past expires_at)
CREATE INDEX "portal_job_postings_status_expires_at_idx"
  ON "portal_job_postings" ("status", "expires_at")
  WHERE status = 'active';

-- Index for efficient archive queries (find expired postings without archived_at)
CREATE INDEX "portal_job_postings_status_archived_at_idx"
  ON "portal_job_postings" ("status", "archived_at")
  WHERE status = 'expired';
