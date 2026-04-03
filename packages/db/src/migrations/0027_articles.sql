-- Create article domain tables for Epic 6 (Story 6.1)
-- Enums must be created before tables that reference them.

CREATE TYPE community_article_language AS ENUM ('en', 'ig', 'both');
CREATE TYPE community_article_visibility AS ENUM ('guest', 'members_only');
CREATE TYPE community_article_status AS ENUM ('draft', 'pending_review', 'published', 'rejected');
CREATE TYPE community_article_category AS ENUM ('discussion', 'announcement', 'event');

CREATE TABLE community_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  title_igbo VARCHAR(255),
  slug VARCHAR(300) NOT NULL UNIQUE,
  content TEXT NOT NULL,
  content_igbo TEXT,
  cover_image_url TEXT,
  language community_article_language NOT NULL DEFAULT 'en',
  visibility community_article_visibility NOT NULL DEFAULT 'members_only',
  status community_article_status NOT NULL DEFAULT 'draft',
  category community_article_category NOT NULL DEFAULT 'discussion',
  is_featured BOOLEAN NOT NULL DEFAULT false,
  reading_time_minutes INTEGER NOT NULL DEFAULT 1,
  view_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_community_articles_author_id ON community_articles(author_id);
CREATE INDEX idx_community_articles_status_created ON community_articles(status, created_at DESC);
CREATE INDEX idx_community_articles_slug ON community_articles(slug);

CREATE TABLE community_article_tags (
  article_id UUID NOT NULL REFERENCES community_articles(id) ON DELETE CASCADE,
  tag VARCHAR(50) NOT NULL,
  PRIMARY KEY (article_id, tag)
);

CREATE INDEX idx_community_article_tags_tag ON community_article_tags(tag);
