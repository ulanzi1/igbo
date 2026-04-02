-- Moderation Architecture Spike — Migration 0042
-- Creates keyword and action tables for platform-wide content moderation.
-- Option B: flagged content remains visible (visibility_override = 'visible' by default).
-- Seed: ≤20 high-confidence keywords. REVIEW with native Igbo speaker before production run.

CREATE TYPE moderation_keyword_category AS ENUM (
    'hate_speech',
    'explicit',
    'spam',
    'harassment',
    'other'
);

CREATE TYPE moderation_keyword_severity AS ENUM (
    'low',
    'medium',
    'high'
);

CREATE TYPE moderation_content_type AS ENUM (
    'post',
    'article',
    'message'
);

CREATE TYPE moderation_action_status AS ENUM (
    'pending',
    'reviewed',
    'dismissed'
);

CREATE TYPE moderation_visibility_override AS ENUM (
    'visible',
    'hidden'
);

-- Keyword list (admin-managed; soft-delete via is_active)
CREATE TABLE platform_moderation_keywords (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword     TEXT        NOT NULL,
    category    moderation_keyword_category NOT NULL,
    severity    moderation_keyword_severity NOT NULL,
    notes       TEXT,
    -- created_by is nullable: if the admin is deleted, keyword history is preserved with null creator
    created_by  UUID        REFERENCES auth_users(id) ON DELETE SET NULL,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Flag records (one per content item — UNIQUE enforced below)
CREATE TABLE platform_moderation_actions (
    id                  UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type        moderation_content_type     NOT NULL,
    content_id          TEXT                        NOT NULL,
    content_author_id   TEXT                        NOT NULL,
    content_preview     TEXT,
    flagged_at          TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
    status              moderation_action_status    NOT NULL DEFAULT 'pending',
    flag_reason         TEXT                        NOT NULL,
    keyword_matched     TEXT,
    auto_flagged        BOOLEAN                     NOT NULL DEFAULT TRUE,
    moderator_id        UUID REFERENCES auth_users(id) ON DELETE SET NULL,
    actioned_at         TIMESTAMPTZ,
    visibility_override moderation_visibility_override NOT NULL DEFAULT 'visible',
    created_at          TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);

-- Unique keyword text (case-sensitive, lower-enforced by application layer)
CREATE UNIQUE INDEX idx_moderation_keywords_keyword ON platform_moderation_keywords(keyword);

-- Admin queue pagination: most recent pending flags first
CREATE INDEX idx_moderation_actions_status_flagged_at
    ON platform_moderation_actions(status, flagged_at DESC);

-- One flag per content item (idempotent insert — ON CONFLICT DO NOTHING)
CREATE UNIQUE INDEX idx_moderation_actions_content
    ON platform_moderation_actions(content_type, content_id);

-- Seed: ≤20 high-confidence keywords
-- [REVIEW REQUIRED] Native Igbo speaker must review this list before production migration.
-- created_by uses a placeholder UUID — replace with actual admin user ID before production.
-- Using gen_random_uuid() for created_by is intentional for the spike seed only.
DO $$
DECLARE
    seed_admin UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
    -- Check if seed admin exists; if not, skip seed (non-production environments)
    IF EXISTS (SELECT 1 FROM auth_users WHERE id = seed_admin) THEN
        INSERT INTO platform_moderation_keywords (keyword, category, severity, notes, created_by) VALUES
            ('spam',        'spam',        'low',    'Common spam signal', seed_admin),
            ('scam',        'spam',        'medium', 'Financial scam indicator', seed_admin),
            ('phishing',    'spam',        'high',   'Credential phishing attempt', seed_admin),
            ('hate',        'hate_speech', 'medium', 'Broad hate speech signal — review context', seed_admin),
            ('slur',        'hate_speech', 'high',   'Generic slur placeholder — replace with specific terms after review', seed_admin),
            ('porn',        'explicit',    'high',   'Explicit content', seed_admin),
            ('nude',        'explicit',    'high',   'Explicit content', seed_admin),
            ('harassment',  'harassment',  'medium', 'Direct harassment signal', seed_admin),
            ('threat',      'harassment',  'high',   'Threat language', seed_admin),
            ('malware',     'spam',        'high',   'Malware distribution', seed_admin)
        ON CONFLICT (keyword) DO NOTHING;
    END IF;
END $$;
