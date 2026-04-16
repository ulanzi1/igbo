-- Migration 0069: Full-text search tsvector columns, GIN indexes, and trigger for portal_job_postings
-- Strategy: Trigger-maintained tsvector (not generated column) so all DB writes stay consistent.
-- English: 'english' config with stemming (A=title, B=description, C=requirements, D=location)
-- Igbo: 'simple' config — no stemming (PostgreSQL has no Igbo dictionary; exact token matching for MVP)

-- Add tsvector columns
ALTER TABLE portal_job_postings ADD COLUMN IF NOT EXISTS search_vector tsvector;
ALTER TABLE portal_job_postings ADD COLUMN IF NOT EXISTS search_vector_igbo tsvector;

-- GIN indexes for fast @@ queries
CREATE INDEX IF NOT EXISTS idx_portal_job_postings_search_vector
  ON portal_job_postings USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_portal_job_postings_search_vector_igbo
  ON portal_job_postings USING GIN(search_vector_igbo);

-- Trigger function: strips HTML, builds weighted tsvectors
CREATE OR REPLACE FUNCTION portal_job_postings_search_vector_update()
RETURNS TRIGGER AS $$
DECLARE
  stripped TEXT;
  stripped_igbo TEXT;
BEGIN
  -- Strip HTML tags for indexing (best-effort; display-side still uses sanitizeHtml())
  stripped      := regexp_replace(COALESCE(NEW.description_html, ''),      '<[^>]+>', ' ', 'g');
  stripped_igbo := regexp_replace(COALESCE(NEW.description_igbo_html, ''), '<[^>]+>', ' ', 'g');

  -- English tsvector with field weights (A=highest priority)
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')),        'A') ||
    setweight(to_tsvector('english', stripped),                        'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.requirements, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.location, '')),     'D');

  -- Igbo tsvector — 'simple' config (no stemming; exact token matching)
  -- Most postings will have NULL search_vector_igbo (description_igbo_html is optional).
  -- NULL rows are not indexed by GIN; WHERE search_vector_igbo @@ q naturally excludes NULLs.
  NEW.search_vector_igbo :=
    to_tsvector('simple',
      COALESCE(NEW.title, '') || ' ' ||
      COALESCE(stripped_igbo, '') || ' ' ||
      COALESCE(NEW.requirements, '')
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger with WHEN guard to prevent tsvector regeneration on non-searchable updates
-- (e.g. view_count increments, status transitions, screening_status updates)
-- OLD IS NULL handles INSERT where OLD does not exist.
-- DROP TRIGGER IF EXISTS keeps the migration re-runnable after a partial failure.
DROP TRIGGER IF EXISTS trg_portal_job_postings_search_vector ON portal_job_postings;
CREATE TRIGGER trg_portal_job_postings_search_vector
  BEFORE INSERT OR UPDATE ON portal_job_postings
  FOR EACH ROW
  WHEN (
    OLD IS NULL OR
    OLD.title IS DISTINCT FROM NEW.title OR
    OLD.description_html IS DISTINCT FROM NEW.description_html OR
    OLD.requirements IS DISTINCT FROM NEW.requirements OR
    OLD.location IS DISTINCT FROM NEW.location OR
    OLD.description_igbo_html IS DISTINCT FROM NEW.description_igbo_html
  )
  EXECUTE FUNCTION portal_job_postings_search_vector_update();

-- Backfill existing rows: compute tsvectors directly (trigger WHEN guard won't fire for SET title=title).
-- This is correct for existing data; new rows are handled by the trigger going forward.
UPDATE portal_job_postings SET
  search_vector = (
    setweight(to_tsvector('english', COALESCE(title, '')),        'A') ||
    setweight(to_tsvector('english',
      regexp_replace(COALESCE(description_html, ''), '<[^>]+>', ' ', 'g')),  'B') ||
    setweight(to_tsvector('english', COALESCE(requirements, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(location, '')),     'D')
  ),
  search_vector_igbo = to_tsvector('simple',
    COALESCE(title, '') || ' ' ||
    regexp_replace(COALESCE(description_igbo_html, ''), '<[^>]+>', ' ', 'g') || ' ' ||
    COALESCE(requirements, '')
  )
WHERE search_vector IS NULL OR search_vector_igbo IS NULL;
