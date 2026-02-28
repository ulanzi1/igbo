-- GiST index for earth_distance proximity queries (Story AI-5 spike).
-- Prerequisites: cube and earthdistance already enabled (0000_extensions.sql).
-- location_lat / location_lng columns already exist from 0005_community_profiles.sql.
CREATE INDEX IF NOT EXISTS idx_community_profiles_ll_to_earth
  ON community_profiles
  USING gist (ll_to_earth(location_lat::float8, location_lng::float8))
  WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;
