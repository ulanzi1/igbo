-- Migration: 0013_chat_tables.sql
-- Story 2.1: Chat Infrastructure & MessageService
-- Creates chat_conversations, chat_conversation_members, and chat_messages tables.

-- Enums
CREATE TYPE conversation_type AS ENUM ('direct', 'group', 'channel');
CREATE TYPE conversation_member_role AS ENUM ('member', 'admin');
CREATE TYPE message_content_type AS ENUM ('text', 'rich_text', 'system');

-- Conversations
CREATE TABLE chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type conversation_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Conversation Members
CREATE TABLE chat_conversation_members (
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ,
  notification_preference VARCHAR(20) DEFAULT 'all',
  role conversation_member_role NOT NULL DEFAULT 'member',
  PRIMARY KEY (conversation_id, user_id)
);

-- Messages
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_type message_content_type NOT NULL DEFAULT 'text',
  parent_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
-- Composite index for message pagination (conversation_id, created_at)
CREATE INDEX idx_chat_messages_conversation_created
  ON chat_messages (conversation_id, created_at);

-- Index for connection-time conversation lookup (user_id on members)
CREATE INDEX idx_chat_conversation_members_user
  ON chat_conversation_members (user_id);

-- GIN index for full-text search on message content (Story 2.7)
CREATE INDEX idx_chat_messages_content_search
  ON chat_messages USING GIN (to_tsvector('english', content));
