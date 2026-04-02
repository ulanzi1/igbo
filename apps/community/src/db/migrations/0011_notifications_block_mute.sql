-- Notification type enum
CREATE TYPE notification_type AS ENUM (
  'message',
  'mention',
  'group_activity',
  'event_reminder',
  'post_interaction',
  'admin_announcement',
  'system'
);

-- Platform notifications table
CREATE TABLE platform_notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  type       notification_type NOT NULL,
  title      VARCHAR(255) NOT NULL,
  body       TEXT NOT NULL,
  link       TEXT,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_platform_notifications_user_id_created_at
  ON platform_notifications(user_id, created_at DESC);

CREATE INDEX idx_platform_notifications_user_id_is_read
  ON platform_notifications(user_id, is_read);

-- Platform blocked users table
CREATE TABLE platform_blocked_users (
  blocker_user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_blocked_users_pkey PRIMARY KEY (blocker_user_id, blocked_user_id)
);

CREATE INDEX idx_platform_blocked_users_blocker_id
  ON platform_blocked_users(blocker_user_id);

CREATE INDEX idx_platform_blocked_users_blocked_id
  ON platform_blocked_users(blocked_user_id);

-- Platform muted users table
CREATE TABLE platform_muted_users (
  muter_user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  muted_user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_muted_users_pkey PRIMARY KEY (muter_user_id, muted_user_id)
);

CREATE INDEX idx_platform_muted_users_muter_id
  ON platform_muted_users(muter_user_id);

CREATE INDEX idx_platform_muted_users_muted_id
  ON platform_muted_users(muted_user_id);
