-- array_to_string() is STABLE in PostgreSQL, which prevents its use in index
-- expressions (which require IMMUTABLE). This thin SQL wrapper declares IMMUTABLE
-- because the result depends only on its inputs (no external state).
CREATE OR REPLACE FUNCTION immutable_array_to_string(arr text[], sep text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT array_to_string($1, $2)
$$;

-- GIN index for member directory full-text search.
-- Covers: display_name, bio, location fields, interests array, languages array.
-- Partial index: only active completed profiles (reduces index size and cost).
-- Prerequisites: pg_trgm already enabled (0000_extensions.sql).
CREATE INDEX IF NOT EXISTS idx_community_profiles_fts
  ON community_profiles
  USING gin(
    to_tsvector('english',
      COALESCE(display_name, '') || ' ' ||
      COALESCE(bio, '') || ' ' ||
      COALESCE(location_city, '') || ' ' ||
      COALESCE(location_state, '') || ' ' ||
      COALESCE(location_country, '') || ' ' ||
      immutable_array_to_string(interests, ' ') || ' ' ||
      immutable_array_to_string(languages, ' ')
    )
  )
  WHERE deleted_at IS NULL AND profile_completed_at IS NOT NULL;

-- Composite B-tree index supporting tiered geographic fallback queries
-- (country → state → city joins). The single-column indexes from 0005 remain
-- but this composite covers multi-predicate WHERE clauses more efficiently.
CREATE INDEX IF NOT EXISTS idx_community_profiles_geo_tiered
  ON community_profiles (location_country, location_state, location_city)
  WHERE deleted_at IS NULL AND profile_completed_at IS NOT NULL;
