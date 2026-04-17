-- Migration 0071: Add is_featured column to portal_job_postings
-- Story P-4.2: Job Discovery Page & Category Browsing
--
-- Adds is_featured boolean flag for promoted/featured job listings.
-- Partial index on (created_at DESC) for fast discovery page featured-jobs query.

ALTER TABLE portal_job_postings
  ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_portal_job_postings_featured
  ON portal_job_postings (created_at DESC)
  WHERE is_featured = true AND status = 'active' AND archived_at IS NULL;
