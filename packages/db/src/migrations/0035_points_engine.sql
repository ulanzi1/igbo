-- Enum for source type (extends in future stories as needed)
CREATE TYPE platform_points_source_type AS ENUM (
    'like_received',
    'event_attended',
    'article_published'
);

-- Append-only ledger: one row per award event
CREATE TABLE platform_points_ledger (
    id                UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID                        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    points            INTEGER                     NOT NULL CHECK (points > 0),
    reason            VARCHAR(100)                NOT NULL,  -- human-readable label
    source_type       platform_points_source_type NOT NULL,
    source_id         TEXT                        NOT NULL,  -- postId, eventId, articleId
    multiplier_applied NUMERIC(4, 2)              NOT NULL DEFAULT 1.00,
    created_at        TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_platform_points_ledger_user_id     ON platform_points_ledger(user_id);
CREATE INDEX idx_platform_points_ledger_created_at  ON platform_points_ledger(created_at);

-- Configurable earning rules (admin-editable via future admin UI)
CREATE TABLE platform_points_rules (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_type VARCHAR(50) NOT NULL UNIQUE,
    base_points   INTEGER     NOT NULL CHECK (base_points > 0),
    description   TEXT,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default earning rules (configurable; [REVIEW] validate values with PO before ship)
INSERT INTO platform_points_rules (activity_type, base_points, description) VALUES
    ('like_received',    1,  'Points awarded to post author when their post receives a like/reaction'),
    ('event_attended',   5,  'Points awarded to event host when an attendee checks in'),
    ('article_published', 10, 'Points awarded to article author when their article is published');
