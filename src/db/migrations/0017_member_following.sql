-- community_member_follows: tracks follower → following relationships.
-- Composite primary key ensures uniqueness (one follow record per pair).
-- Index on following_id supports efficient "who follows user X?" queries.
CREATE TABLE IF NOT EXISTS community_member_follows (
  follower_id   UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  following_id  UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_community_member_follows_following_id
  ON community_member_follows (following_id);

CREATE INDEX IF NOT EXISTS idx_community_member_follows_follower_id
  ON community_member_follows (follower_id);

-- Denormalized follow counts on community_profiles.
-- Updated atomically in the same DB transaction as the follow/unfollow operation.
-- GREATEST(..., 0) guard in application code prevents negative values on concurrent ops.
ALTER TABLE community_profiles
  ADD COLUMN IF NOT EXISTS follower_count  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count INTEGER NOT NULL DEFAULT 0;
