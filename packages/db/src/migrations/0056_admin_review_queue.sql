-- Migration: 0056_admin_review_queue
-- Adds revision tracking to job postings and creates admin review log table

-- Add revision_count to portal_job_postings
ALTER TABLE portal_job_postings
  ADD COLUMN IF NOT EXISTS revision_count INTEGER NOT NULL DEFAULT 0;

-- Index for efficient queue queries by status
CREATE INDEX IF NOT EXISTS idx_portal_job_postings_status
  ON portal_job_postings (status);

-- Create portal_admin_reviews table
CREATE TABLE IF NOT EXISTS portal_admin_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posting_id UUID NOT NULL REFERENCES portal_job_postings(id) ON DELETE CASCADE,
  reviewer_user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  decision VARCHAR(20) NOT NULL,
  feedback_comment TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_admin_reviews_posting_id
  ON portal_admin_reviews (posting_id);

CREATE INDEX IF NOT EXISTS idx_portal_admin_reviews_reviewer_user_id
  ON portal_admin_reviews (reviewer_user_id);

CREATE INDEX IF NOT EXISTS idx_portal_admin_reviews_reviewed_at
  ON portal_admin_reviews (reviewed_at);
