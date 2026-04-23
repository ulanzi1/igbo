-- Portal Messaging Extension (P-5.1A)
-- Adds portal_context_json, participant_role, unique partial index, and CHECK constraints.
-- See: _bmad-output/implementation-artifacts/p-5-1a-messaging-data-model-extension.md

-- 1. Create participant_role_type enum
CREATE TYPE participant_role_type AS ENUM ('employer', 'seeker', 'community_member');
--> statement-breakpoint

-- 2. Add portal_context_json JSONB column to chat_conversations (nullable — only portal conversations populate this)
ALTER TABLE chat_conversations ADD COLUMN portal_context_json JSONB;
--> statement-breakpoint

-- 3. Add participant_role column to chat_conversation_members
--    PG11+ lazy default — no table rewrite on existing rows; existing rows read as 'community_member'
ALTER TABLE chat_conversation_members ADD COLUMN participant_role participant_role_type NOT NULL DEFAULT 'community_member';
--> statement-breakpoint

-- 4. Unique partial index: one active portal conversation per application
CREATE UNIQUE INDEX unq_chat_conversations_application_id ON chat_conversations (application_id) WHERE context = 'portal' AND deleted_at IS NULL;
--> statement-breakpoint

-- 5. CHECK: portal conversations must have portal_context_json
ALTER TABLE chat_conversations ADD CONSTRAINT chk_portal_requires_context_json CHECK (context != 'portal' OR portal_context_json IS NOT NULL);
--> statement-breakpoint

-- 6. CHECK: community conversations must NOT have portal_context_json
ALTER TABLE chat_conversations ADD CONSTRAINT chk_community_no_context_json CHECK (context != 'community' OR portal_context_json IS NULL);
