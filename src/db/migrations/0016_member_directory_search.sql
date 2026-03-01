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
      array_to_string(interests, ' ') || ' ' ||
      array_to_string(languages, ' ')
    )
  )
  WHERE deleted_at IS NULL AND profile_completed_at IS NOT NULL;

-- Composite B-tree index supporting tiered geographic fallback queries
-- (country → state → city joins). The single-column indexes from 0005 remain
-- but this composite covers multi-predicate WHERE clauses more efficiently.
CREATE INDEX IF NOT EXISTS idx_community_profiles_geo_tiered
  ON community_profiles (location_country, location_state, location_city)
  WHERE deleted_at IS NULL AND profile_completed_at IS NOT NULL;
