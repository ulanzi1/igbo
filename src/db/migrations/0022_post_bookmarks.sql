-- Bookmarks: private per-member save list for posts.
-- Composite PK (user_id, post_id) — each member can bookmark a post only once.
-- ON DELETE CASCADE on both FKs: bookmarks auto-removed when user or post is deleted.
-- INDEX on user_id for efficient "get all bookmarks for user" queries.
--
-- pinned_at column on community_posts: tracks when the post was pinned for ordering.
-- Multiple pinned posts shown in "most recently pinned first" order.
-- NULL means post is not currently pinned (even if isPinned was previously true).

CREATE TABLE community_post_bookmarks (
    user_id     UUID        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    post_id     UUID        NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_community_post_bookmarks PRIMARY KEY (user_id, post_id)
);

CREATE INDEX idx_community_post_bookmarks_user_id ON community_post_bookmarks(user_id);
CREATE INDEX idx_community_post_bookmarks_post_id ON community_post_bookmarks(post_id);

-- Add pinned_at to community_posts to enable ordering pinned posts by pin date.
-- NULL = not currently pinned; set to NOW() when admin pins, set to NULL on unpin.
ALTER TABLE community_posts
    ADD COLUMN pinned_at TIMESTAMPTZ;
