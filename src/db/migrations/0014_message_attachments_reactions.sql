-- Migration: 0014_message_attachments_reactions.sql
-- Story 2.4: Rich Messaging & File Attachments
-- Creates chat_message_attachments and chat_message_reactions tables.

-- Message Attachments
-- Denormalized file_url/file_name/file_type/file_size for fast reads without joins
CREATE TABLE chat_message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  file_upload_id UUID NOT NULL REFERENCES platform_file_uploads(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(50),
  file_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Message Reactions
-- Composite PK enforces unique (message, user, emoji) constraint
CREATE TABLE chat_message_reactions (
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  emoji VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

-- Indexes
CREATE INDEX idx_chat_message_attachments_message_id
  ON chat_message_attachments (message_id);

CREATE INDEX idx_chat_message_reactions_message_id
  ON chat_message_reactions (message_id);

CREATE INDEX idx_chat_message_reactions_user_id
  ON chat_message_reactions (user_id);
