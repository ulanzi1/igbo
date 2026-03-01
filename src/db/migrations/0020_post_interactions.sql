-- Post reactions: single-select per member per post.
-- Composite PK (post_id, user_id) enforces one reaction type per member.
-- Changing reaction type: UPDATE existing row (count unchanged).
-- Toggling same type: DELETE row (decrement likeCount on community_posts).
-- Design note: Single-select (unlike chat emoji reactions) to prevent points inflation
-- in the future points engine (Story 8.1).

CREATE TYPE community_post_reaction_type AS ENUM ('like', 'love', 'celebrate', 'insightful', 'funny');

CREATE TABLE community_post_reactions (
    post_id     UUID        NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    reaction_type community_post_reaction_type NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_community_post_reactions PRIMARY KEY (post_id, user_id)
);

CREATE INDEX idx_community_post_reactions_post_id ON community_post_reactions(post_id);

-- Post comments: one level of nested replies via parent_comment_id.
-- Soft-delete via deleted_at (content blanked at display layer, not DB level).
-- commentCount on community_posts increments on insert, NOT decremented on soft-delete.

CREATE TABLE community_post_comments (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id          UUID        NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    author_id        UUID        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    content          TEXT        NOT NULL,
    parent_comment_id UUID       REFERENCES community_post_comments(id) ON DELETE CASCADE,
    deleted_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_community_post_comments_post_id   ON community_post_comments(post_id);
CREATE INDEX idx_community_post_comments_parent_id ON community_post_comments(parent_comment_id);

-- Reposts: nullable self-referential FK for repost attribution.
-- When a repost is created, original_post_id points to the original post.
-- ON DELETE SET NULL: if original is deleted, repost remains but loses attribution.

ALTER TABLE community_posts
    ADD COLUMN original_post_id UUID REFERENCES community_posts(id) ON DELETE SET NULL;

CREATE INDEX idx_community_posts_original_post_id ON community_posts(original_post_id)
    WHERE original_post_id IS NOT NULL;
