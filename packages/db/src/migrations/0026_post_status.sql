-- Add post status enum and column for group moderation (postingPermission = 'moderated')
-- Posts in moderated groups are held as 'pending_approval' until a leader approves.
-- Existing posts default to 'active'.

CREATE TYPE community_post_status AS ENUM ('active', 'pending_approval');

ALTER TABLE community_posts
  ADD COLUMN status community_post_status NOT NULL DEFAULT 'active';

CREATE INDEX idx_community_posts_status ON community_posts(status)
  WHERE status = 'pending_approval';
