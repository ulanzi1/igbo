CREATE TABLE IF NOT EXISTS community_article_comments (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id        UUID        NOT NULL REFERENCES community_articles(id) ON DELETE CASCADE,
    author_id         UUID        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    content           TEXT        NOT NULL,
    parent_comment_id UUID        REFERENCES community_article_comments(id) ON DELETE CASCADE,
    deleted_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_article_comments_article_id_created
    ON community_article_comments(article_id, created_at);
