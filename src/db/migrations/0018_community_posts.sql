-- community_posts: the core content unit for the news feed.
-- group_id is intentionally unkeyed in this migration — FK to community_groups
-- will be added in Story 5.1 once that table exists.
-- content_type 'announcement' is used for admin communications (always visible).
-- is_pinned posts always appear at the top of the feed regardless of sort mode.

CREATE TYPE community_post_content_type AS ENUM ('text', 'rich_text', 'media', 'announcement');
CREATE TYPE community_post_visibility AS ENUM ('public', 'group', 'members_only');

CREATE TABLE IF NOT EXISTS community_posts (
  id            UUID        NOT NULL DEFAULT gen_random_uuid(),
  author_id     UUID        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  content       TEXT        NOT NULL,
  content_type  community_post_content_type NOT NULL DEFAULT 'text',
  visibility    community_post_visibility   NOT NULL DEFAULT 'members_only',
  group_id      UUID,
  is_pinned     BOOLEAN     NOT NULL DEFAULT false,
  like_count    INTEGER     NOT NULL DEFAULT 0,
  comment_count INTEGER     NOT NULL DEFAULT 0,
  share_count   INTEGER     NOT NULL DEFAULT 0,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_community_posts_author_id
  ON community_posts (author_id);

CREATE INDEX IF NOT EXISTS idx_community_posts_created_at
  ON community_posts (created_at DESC);

-- Partial index: only index pinned posts since most posts are unpinned.
CREATE INDEX IF NOT EXISTS idx_community_posts_is_pinned
  ON community_posts (is_pinned) WHERE is_pinned = true;

-- community_post_media: stores ordered media attachments for a post.
-- sort_order determines display sequence (0 = first).
CREATE TABLE IF NOT EXISTS community_post_media (
  id         UUID        NOT NULL DEFAULT gen_random_uuid(),
  post_id    UUID        NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  media_url  TEXT        NOT NULL,
  media_type VARCHAR(20) NOT NULL,  -- 'image' | 'video'
  alt_text   TEXT,
  sort_order INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_community_post_media_post_id
  ON community_post_media (post_id);
