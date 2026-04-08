-- Migration 0063: Job application submission payload columns + partial unique index
-- Story: P-2.5A Job Application Submission

-- Add selected CV (nullable FK — CV deletions do NOT cascade-delete applications)
ALTER TABLE portal_applications ADD COLUMN selected_cv_id UUID REFERENCES portal_seeker_cvs(id) ON DELETE SET NULL;

-- Add cover letter text (max 2000 chars enforced by CHECK)
ALTER TABLE portal_applications ADD COLUMN cover_letter_text TEXT CHECK (char_length(cover_letter_text) <= 2000);

-- Add portfolio links as JSONB array of URL strings (max 3 enforced at application layer)
ALTER TABLE portal_applications ADD COLUMN portfolio_links_json JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Partial unique index: at most one non-withdrawn application per (job, seeker)
-- Re-apply after withdrawal IS allowed (withdrawn rows are excluded by the predicate)
CREATE UNIQUE INDEX portal_applications_job_id_seeker_id_active_uq
  ON portal_applications (job_id, seeker_user_id)
  WHERE status <> 'withdrawn';

-- Add cover-letter opt-in flag to job postings (employer-controlled, default FALSE)
-- Existing rows are backfilled to FALSE (NOT NULL DEFAULT handles this)
ALTER TABLE portal_job_postings ADD COLUMN enable_cover_letter BOOLEAN NOT NULL DEFAULT FALSE;
