-- Verification badge type enum
CREATE TYPE badge_type_enum AS ENUM ('blue', 'red', 'purple');

-- One badge per member (user_id is PK)
CREATE TABLE community_user_badges (
    user_id     UUID            PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
    badge_type  badge_type_enum NOT NULL,
    assigned_by UUID            NOT NULL REFERENCES auth_users(id),
    assigned_at TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX idx_community_user_badges_badge_type ON community_user_badges(badge_type);
