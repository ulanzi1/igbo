-- Migration: 0055_job_analytics
-- Add view_count (denormalized counter) and community_post_id (share tracking) to portal_job_postings.
-- community_post_id is a logical-only FK (no REFERENCES constraint) — community post deletion makes
-- this stale, which is acceptable. The portal uses this to detect if a posting has been shared.

ALTER TABLE portal_job_postings
  ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN community_post_id UUID;
