-- 0052_job_posting_lifecycle.sql
-- Adds lifecycle management columns to portal_job_postings

-- Create closed outcome enum
CREATE TYPE "portal_closed_outcome" AS ENUM ('filled_via_portal', 'filled_internally', 'cancelled');

-- Add admin feedback comment (populated by admin when status = rejected)
ALTER TABLE "portal_job_postings" ADD COLUMN "admin_feedback_comment" TEXT;

-- Add closed outcome (populated when status = filled)
ALTER TABLE "portal_job_postings" ADD COLUMN "closed_outcome" "portal_closed_outcome";

-- Add closed_at timestamp (set when posting moves to filled; used by P-1.5/Epic 4 for 30-day visibility window)
ALTER TABLE "portal_job_postings" ADD COLUMN "closed_at" TIMESTAMPTZ;
