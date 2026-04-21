-- Migration 0073: Add conversation context discriminator for cross-app isolation
-- Adds 'context' column to distinguish community vs portal conversations
-- PG11+ lazy default: no table rewrite for NOT NULL DEFAULT on existing rows

-- 1. Create conversation_context enum type
DO $$ BEGIN
  CREATE TYPE conversation_context AS ENUM ('community', 'portal');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add context column with default 'community' (existing rows get lazy default)
ALTER TABLE chat_conversations
  ADD COLUMN context conversation_context NOT NULL DEFAULT 'community';

-- 3. Add application_id column (nullable, FK to portal_applications)
ALTER TABLE chat_conversations
  ADD COLUMN application_id UUID REFERENCES portal_applications(id) ON DELETE SET NULL;

-- 4. CHECK: portal conversations MUST have applicationId
ALTER TABLE chat_conversations
  ADD CONSTRAINT chk_portal_requires_application
  CHECK (context != 'portal' OR application_id IS NOT NULL);

-- 5. CHECK: portal conversations MUST NOT have channelId
ALTER TABLE chat_conversations
  ADD CONSTRAINT chk_portal_no_channel
  CHECK (context != 'portal' OR channel_id IS NULL);

-- 6. CHECK: community conversations MUST NOT have applicationId
ALTER TABLE chat_conversations
  ADD CONSTRAINT chk_community_no_application
  CHECK (context != 'community' OR application_id IS NULL);

-- 7. Immutability trigger: prevent context mutation after creation
CREATE OR REPLACE FUNCTION prevent_context_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.context IS DISTINCT FROM NEW.context THEN
    RAISE EXCEPTION 'conversation context is immutable: cannot change from % to %', OLD.context, NEW.context;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chat_conversations_context_immutable
  BEFORE UPDATE ON chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION prevent_context_mutation();
