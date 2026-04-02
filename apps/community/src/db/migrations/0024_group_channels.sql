CREATE TABLE IF NOT EXISTS community_group_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying channels by group
CREATE INDEX IF NOT EXISTS idx_community_group_channels_group_id ON community_group_channels(group_id);

-- Ensure only one default channel per group
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_group_channels_default ON community_group_channels(group_id) WHERE is_default = TRUE;

-- Add channel_id FK to chat_conversations (nullable — only channel-type convs have this set)
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES community_group_channels(id) ON DELETE SET NULL;

-- Partial index for channel conversation lookups (non-null only)
CREATE INDEX IF NOT EXISTS idx_chat_conversations_channel_id ON chat_conversations(channel_id) WHERE channel_id IS NOT NULL;
