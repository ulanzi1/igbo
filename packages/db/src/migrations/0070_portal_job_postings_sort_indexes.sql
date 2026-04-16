-- Migration 0070: Composite sort indexes for cursor-paginated job search
-- Part of PREP-G (Cursor Pagination PoC). These indexes support the seek
-- predicates for date and salary sort modes in searchJobPostings().
--
-- Partial indexes on salary columns are intentional: postings with NULL salary
-- values cluster together in NULLS LAST / NULLS FIRST position; including them
-- in the index would add bulk without improving seek performance for non-null
-- salary rows. The NULL cluster is small and handled by a sequential scan of
-- the NULL tail in the seek predicate.
--
-- See docs/decisions/cursor-pagination.md for seek predicate shapes and
-- expected EXPLAIN ANALYZE plan shapes (Bitmap Index Scan on these indexes).

-- Date sort: created_at DESC, id ASC — supports "date" cursor mode
CREATE INDEX IF NOT EXISTS idx_portal_job_postings_created_at
  ON portal_job_postings (created_at DESC, id);

-- Salary ascending: salary_min ASC, id — supports "salary_asc" cursor mode
-- WHERE salary_min IS NOT NULL keeps the index lean (NULLs not indexed)
CREATE INDEX IF NOT EXISTS idx_portal_job_postings_salary_min
  ON portal_job_postings (salary_min ASC, id)
  WHERE salary_min IS NOT NULL;

-- Salary descending: salary_max DESC, id — supports "salary_desc" cursor mode
-- WHERE salary_max IS NOT NULL keeps the index lean (NULLs not indexed)
CREATE INDEX IF NOT EXISTS idx_portal_job_postings_salary_max
  ON portal_job_postings (salary_max DESC, id)
  WHERE salary_max IS NOT NULL;
