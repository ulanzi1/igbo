-- Add muted_until column to community_group_members for group-scoped muting
ALTER TABLE community_group_members ADD COLUMN muted_until TIMESTAMPTZ;

-- Create community_group_moderation_logs table for audit trail
CREATE TABLE community_group_moderation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
  moderator_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE,
  target_type VARCHAR NOT NULL, -- 'post' | 'comment' | 'member'
  target_id UUID,               -- postId, commentId, or memberId
  action VARCHAR NOT NULL,       -- 'mute' | 'unmute' | 'ban' | 'unban' | 'remove_post' | 'remove_comment' | 'promote_leader' | 'demote_leader'
  reason TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_group_moderation_logs_group_id ON community_group_moderation_logs(group_id);
CREATE INDEX idx_group_moderation_logs_moderator_id ON community_group_moderation_logs(moderator_id);
CREATE INDEX idx_group_moderation_logs_target_user_id ON community_group_moderation_logs(target_user_id);
