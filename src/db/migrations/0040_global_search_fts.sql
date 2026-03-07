-- Migration 0040: Global search FTS indexes
-- Adds GIN + tsvector indexes for unified search across posts, articles, groups, and events.
-- Reuses existing: idx_community_profiles_fts (0016), idx_chat_messages_content_search (0013).
-- All indexes are partial (visibility/status filters) and idempotent (IF NOT EXISTS).

-- community_posts: active, non-deleted posts
CREATE INDEX IF NOT EXISTS idx_community_posts_fts
  ON community_posts
  USING gin(
    to_tsvector('english', COALESCE(content, ''))
  )
  WHERE status = 'active' AND deleted_at IS NULL;

-- community_articles: bilingual — covers title, title_igbo, content, content_igbo
CREATE INDEX IF NOT EXISTS idx_community_articles_fts
  ON community_articles
  USING gin(
    to_tsvector('english',
      COALESCE(title, '') || ' ' ||
      COALESCE(title_igbo, '') || ' ' ||
      COALESCE(content, '') || ' ' ||
      COALESCE(content_igbo, '')
    )
  )
  WHERE status = 'published' AND deleted_at IS NULL;

-- community_groups: non-hidden, non-deleted groups
CREATE INDEX IF NOT EXISTS idx_community_groups_fts
  ON community_groups
  USING gin(
    to_tsvector('english',
      COALESCE(name, '') || ' ' ||
      COALESCE(description, '')
    )
  )
  WHERE visibility != 'hidden' AND deleted_at IS NULL;

-- community_events: non-cancelled, non-deleted events
CREATE INDEX IF NOT EXISTS idx_community_events_fts
  ON community_events
  USING gin(
    to_tsvector('english',
      COALESCE(title, '') || ' ' ||
      COALESCE(description, '')
    )
  )
  WHERE status != 'cancelled' AND deleted_at IS NULL;

-- platform_governance_documents: conditional — table may not exist until Epic 11
DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'platform_governance_documents'
  ) THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_platform_governance_documents_fts
        ON platform_governance_documents
        USING gin(
          to_tsvector('english',
            COALESCE(title, '') || ' ' ||
            COALESCE(content, '') || ' ' ||
            COALESCE(content_igbo, '')
          )
        )
    $sql$;
  END IF;
END $$;
