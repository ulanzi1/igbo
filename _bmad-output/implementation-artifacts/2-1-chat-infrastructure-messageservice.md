# Story 2.1: Chat Infrastructure & MessageService

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the `/chat` namespace fully implemented with the MessageService abstraction layer,
so that all chat features have a reliable real-time foundation with E2E encryption migration readiness.

> **Prerequisite:** The Socket.IO realtime server, Redis adapter, `/notifications` namespace, and `SocketProvider` React context are already operational from Story 1.15. This story adds the `/chat` namespace implementation and chat data model.

## Acceptance Criteria

1. **Chat data model created** — Migration `0013` creates `chat_conversations` table with: `id` (UUID PK), `type` enum (`direct`, `group`, `channel`), `created_at`, `updated_at`, `deleted_at` (soft-delete)
   - The `channel` type is defined now for Story 5.3 (group channels) to avoid a future schema migration

2. **Conversation members table created** — Migration `0013` creates `chat_conversation_members` table with: `conversation_id` (FK), `user_id` (FK), `joined_at`, `last_read_at`, `notification_preference`, `role` enum (`member`, `admin`)

3. **Messages table created** — Migration `0013` creates `chat_messages` table with: `id` (UUID PK), `conversation_id` (FK), `sender_id` (FK), `content` (text), `content_type` enum (`text`, `rich_text`, `system`), `parent_message_id` (self-referencing FK for threads), `edited_at`, `deleted_at`, `created_at`

4. **Indexes created** — Composite index on `(conversation_id, created_at)` for message pagination; GIN index with `tsvector` on `chat_messages.content` for full-text search (Story 2.7)

5. **MessageService abstraction implemented** — `src/services/message-service.ts` defines `MessageService` interface; `PlaintextMessageService` is the Phase 1 implementation that stores/retrieves plaintext in PostgreSQL; interface supports future `EncryptedMessageService` swap without changing calling code (NFR-S12)

6. **`/chat` namespace fully implemented** — Replaces current skeleton in `src/server/realtime/namespaces/chat.ts`:
   - On connection: member auto-joins rooms for all their active conversations (`conversation:{id}`)
   - Authentication middleware validates sessions via Redis (reuses Story 1.15 pattern)
   - Handles `message:send`, `message:delivered` events
   - Room design: `conversation:{conversationId}`

7. **Reconnection with message gap sync** — Client sends last received timestamp on reconnect:
   - Gap <= 24 hours: server replays missed messages (paginated, max 100 per batch)
   - Gap > 24 hours: server returns `sync:full_refresh` event; client fetches via REST

8. **SocketProvider extended** — `src/providers/SocketProvider.tsx` extended with chat-specific hooks for subscribing to conversation events

9. **EventBus bridge extended** — `src/server/realtime/subscribers/eventbus-bridge.ts` handles `message.sent` events to route to appropriate conversation rooms

10. **Drizzle schema module created** — `src/db/schema/chat-messages.ts` and `src/db/schema/chat-conversations.ts` define all chat tables with proper relations

11. **REST API endpoints created** — Under `/api/v1/conversations/`:
    - `GET /api/v1/conversations` — List member's conversations (cursor-based pagination)
    - `GET /api/v1/conversations/[conversationId]/messages` — Get messages for conversation (cursor-based pagination)
    - `POST /api/v1/conversations` — Create new conversation
    - All wrapped with `withApiHandler()`, rate-limited, authenticated via `requireAuthenticatedSession()`

12. **Block enforcement in messaging** — Message sending checks `platform_blocked_users` table; blocked users cannot send messages to blockers; reuses existing `BlockService` from Story 1.15

## Tasks / Subtasks

- [x] Task 1: Create database migration `0013_chat_tables.sql` (AC: #1, #2, #3, #4)
  - [x] 1.1: Define `conversation_type` enum (`direct`, `group`, `channel`)
  - [x] 1.2: Define `conversation_member_role` enum (`member`, `admin`)
  - [x] 1.3: Define `message_content_type` enum (`text`, `rich_text`, `system`)
  - [x] 1.4: Create `chat_conversations` table with soft-delete
  - [x] 1.5: Create `chat_conversation_members` table with composite FK constraints
  - [x] 1.6: Create `chat_messages` table with self-referencing `parent_message_id`
  - [x] 1.7: Create composite index on `(conversation_id, created_at)` for pagination
  - [x] 1.8: Create index on `chat_conversation_members (user_id)` for connection-time conversation lookup (needed by auto-join on connect)
  - [x] 1.9: Create GIN index with `tsvector` on `chat_messages.content` for full-text search
  - [x] 1.10: Apply migration with `npm run db:migrate` and verify all tables, indexes, and enums exist

- [x] Task 2: Create Drizzle schema modules (AC: #10)
  - [x] 2.1: Create `src/db/schema/chat-conversations.ts` — `chatConversations` + `chatConversationMembers` tables with relations; declare `pgEnum('conversation_type', ['direct', 'group', 'channel'])` and `pgEnum('conversation_member_role', ['member', 'admin'])` — export both enums for reuse in query files
  - [x] 2.2: Create `src/db/schema/chat-messages.ts` — `chatMessages` table with relations; declare `pgEnum('message_content_type', ['text', 'rich_text', 'system'])` — export for reuse in query files
  - [x] 2.3: Register schemas in `src/db/index.ts` (add `import * as chatConversationsSchema` + `import * as chatMessagesSchema`)
  - [x] 2.4: Write tests for schema definitions

- [x] Task 3: Create DB query functions (AC: #5, #11, #12)
  - [x] 3.1: Create `src/db/queries/chat-conversations.ts` — CRUD for conversations + members
  - [x] 3.2: Create `src/db/queries/chat-messages.ts` — CRUD for messages with cursor-based pagination
  - [x] 3.3: Write tests for query functions

- [x] Task 4: Implement MessageService abstraction (AC: #5)
  - [x] 4.1: Define `MessageService` interface in `src/services/message-service.ts`
  - [x] 4.2: Implement `PlaintextMessageService` class
  - [x] 4.3: Export singleton `messageService` instance
  - [x] 4.4: Write comprehensive tests for PlaintextMessageService

- [x] Task 5: Implement `/chat` namespace handlers (AC: #6, #7, #9)
  - [x] 5.0: Add `CHAT_REPLAY_WINDOW_MS = 86400000` constant to `src/config/realtime.ts` (24-hour chat replay window, distinct from `REPLAY_WINDOW_MS` 1-hour notification window)
  - [x] 5.1: Implement connection handler — auto-join conversation rooms
  - [x] 5.2: Implement `message:send` event handler (validate, persist via MessageService, broadcast to room)
  - [x] 5.3: Implement `message:delivered` event handler (Phase 1 no-op: send Socket.IO ACK only, no DB write — delivery tracking deferred to Story 2.6)
  - [x] 5.4: Implement reconnection gap sync (replay missed messages or `sync:full_refresh`) using `CHAT_REPLAY_WINDOW_MS`
  - [x] 5.5: Extend `MessageSentEvent` in `src/types/events.ts` to add `content: string`, `contentType: string`, `createdAt: string` fields (EventBus bridge needs full payload to emit `message:new` — it cannot query the DB in-flight)
  - [x] 5.6: Extend EventBus bridge `src/server/realtime/subscribers/eventbus-bridge.ts` for `message.sent` — route to `ROOM_CONVERSATION(payload.conversationId)` on `/chat` namespace
  - [x] 5.7: Write comprehensive tests for all namespace handlers

- [x] Task 6: Create REST API routes (AC: #11, #12)
  - [x] 6.1: Create `src/app/api/v1/conversations/route.ts` — GET (list) + POST (create)
  - [x] 6.2: Create `src/app/api/v1/conversations/[conversationId]/messages/route.ts` — GET messages
  - [x] 6.3: Add rate limit presets to `RATE_LIMIT_PRESETS` in `src/services/rate-limiter.ts`: `CONVERSATION_LIST` (60/min), `CONVERSATION_CREATE` (10/min), `MESSAGE_FETCH` (120/min)
  - [x] 6.4: Enforce block checks on conversation creation and message retrieval
  - [x] 6.5: Write tests for all API routes

- [x] Task 7: Extend SocketProvider with chat hooks (AC: #8)
  - [x] 7.1: Create `src/features/chat/hooks/use-chat.ts` — subscribe to chat events via `chatSocket`; track `lastReceivedAt` timestamp in React state (update on every `message:new`); emit `sync:request` with `{ lastReceivedAt: ISO8601 }` on socket `connect` event to trigger server-side gap sync (AC: #7)
  - [x] 7.2: Create `src/features/chat/hooks/use-conversations.ts` — conversation list with TanStack Query + Socket.IO invalidation
  - [x] 7.3: Create `src/features/chat/types/index.ts` — shared chat types
  - [x] 7.4: Create `src/features/chat/index.ts` — barrel export
  - [x] 7.5: Write tests for hooks

- [x] Task 8: Add i18n keys for chat infrastructure (AC: all)
  - [x] 8.1: Add `Chat` namespace to `messages/en.json` (system messages, error messages)
  - [x] 8.2: Add `Chat` namespace to `messages/ig.json` (translated system messages, error messages)

## Dev Notes

### Critical Architecture Patterns

- **MessageService abstraction is the core of this story.** All message read/write operations MUST go through the `MessageService` interface — never direct DB queries from routes or namespace handlers. This enables future E2E encryption swap (NFR-S12).
- **PlaintextMessageService** is the Phase 1 implementation. It wraps Drizzle queries. The interface should define: `sendMessage()`, `getMessages()`, `getMessage()`, `editMessage()`, `deleteMessage()`, `getConversationMessages()`. **`sendMessage()` MUST update `chat_conversations.updated_at` in the same transaction** — conversation list ordering by recency (Story 2.2) depends on this field being current.
- **Room pattern**: `conversation:{conversationId}` — already defined in `src/config/realtime.ts` as `ROOM_CONVERSATION()`.
- **EventBus events**: Emit `message.sent` from MessageService (never from routes). `MessageSentEvent` in `src/types/events.ts` must be extended (Task 5.5) to include `content`, `contentType`, and `createdAt` — the EventBus bridge needs the full message payload to emit `message:new` to the conversation room. It cannot query the DB in-flight. Compare: `NotificationCreatedEvent` already includes the full notification payload for the same reason.
- **Block enforcement**: In the `/chat` namespace handler (realtime container), import `isBlocked` from `@/db/queries/block-mute` directly — do NOT use `@/services/block-service` in namespace handler code. Established realtime container pattern: raw query layer only (same as `notifications.ts` importing from `@/db/queries/notifications`). REST routes in Task 6 may use `BlockService` normally since they run in Next.js.

### Migration Notes

- **CRITICAL**: Hand-write SQL migration — `drizzle-kit generate` fails with `server-only` error (established pattern from Epic 1).
- Next migration number: `0013` (last is `0012_auth_users_image_column.sql`).
- Migration file: `src/db/migrations/0013_chat_tables.sql`
- The `channel` conversation type is defined now for Epic 5 (Story 5.3) — do NOT defer this.
- Use `gen_random_uuid()` for UUID PKs (same pattern as all other tables).
- All FKs should CASCADE on delete (matching `platform_notifications` and `platform_blocked_users` patterns).
- `deleted_at` on `chat_conversations` and `chat_messages` for soft-delete.
- GIN index for tsvector: `CREATE INDEX idx_chat_messages_content_search ON chat_messages USING GIN (to_tsvector('english', content));`

### Existing Code to Reuse/Extend

| Component               | File                                                 | What to Do                                                                    |
| ----------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| Chat namespace skeleton | `src/server/realtime/namespaces/chat.ts`             | Replace skeleton with full implementation                                     |
| Notifications namespace | `src/server/realtime/namespaces/notifications.ts`    | Reference for presence, sync, heartbeat patterns                              |
| Auth middleware         | `src/server/realtime/middleware/auth.ts`             | Already applied to `/chat` namespace — no changes needed                      |
| Rate limiter middleware | `src/server/realtime/middleware/rate-limiter.ts`     | Already applied — `message:send` limit (30/min) already configured            |
| EventBus bridge         | `src/server/realtime/subscribers/eventbus-bridge.ts` | Extend to handle `message.sent` events → route to conversation rooms          |
| SocketProvider          | `src/providers/SocketProvider.tsx`                   | Already manages `chatSocket` — create hooks that consume it                   |
| BlockService            | `src/services/block-service.ts`                      | Use `isUserBlocked()` and `getBlockList()` for enforcement                    |
| NotificationService     | `src/services/notification-service.ts`               | Reference for EventBus listener pattern + recipient filtering                 |
| Realtime config         | `src/config/realtime.ts`                             | `ROOM_CONVERSATION()`, `NAMESPACE_CHAT`, `SOCKET_RATE_LIMITS` already defined |
| Event types             | `src/types/events.ts`                                | `MessageSentEvent`, `MessageMentionedEvent` already defined                   |

### Socket.IO Event Reference

| Event                 | Direction       | Payload                                                                    | Notes                                                                                        |
| --------------------- | --------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `message:send`        | Client → Server | `{ conversationId, content, contentType?, parentMessageId? }`              | Rate limited: 30/min                                                                         |
| `message:new`         | Server → Room   | `{ messageId, conversationId, senderId, content, contentType, createdAt }` | Broadcast to conversation room                                                               |
| `message:delivered`   | Client → Server | `{ messageId }`                                                            | Phase 1 no-op: send Socket.IO ACK, no DB write; full delivery tracking deferred to Story 2.6 |
| `sync:replay`         | Server → Client | `{ messages: Message[], hasMore: boolean }`                                | On reconnect, gap <= 24h                                                                     |
| `sync:full_refresh`   | Server → Client | `{}`                                                                       | On reconnect, gap > 24h                                                                      |
| `conversation:joined` | Server → Client | `{ conversationId }`                                                       | Confirmation after auto-join                                                                 |

### Cursor-Based Pagination Pattern

Per architecture.md, chat messages use cursor-based pagination. Pattern:

```
GET /api/v1/conversations/{id}/messages?cursor={messageId}&limit=50&direction=before
```

- `cursor`: ID of the message to paginate from (omit for latest)
- `limit`: Number of messages (default 50, max 100)
- `direction`: `before` (older) or `after` (newer)
- Response: `{ data: Message[], meta: { cursor: string | null, hasMore: boolean } }`
- **Query approach**: The cursor is a `messageId` (not a timestamp). Resolve it to `created_at` first, then paginate using the `(conversation_id, created_at)` composite index — avoids slow ID scans:
  ```sql
  -- direction=before (load older messages):
  WHERE conversation_id = $1
    AND created_at < (SELECT created_at FROM chat_messages WHERE id = $cursor)
  ORDER BY created_at DESC LIMIT $limit
  ```

### Reconnection Gap Sync Implementation

The `/notifications` namespace in `src/server/realtime/namespaces/notifications.ts` already implements this pattern. Follow the same approach for `/chat`:

1. Client sends `{ lastReceivedAt: ISO8601 }` on connection
2. Server checks gap: `Date.now() - lastReceivedAt`
3. Gap <= `REPLAY_WINDOW_MS` (currently 1 hour in config — but epics say 24 hours for chat): replay missed messages paginated (max 100 per batch)
4. Gap > threshold: emit `sync:full_refresh` — client fetches via REST

**NOTE**: The `REPLAY_WINDOW_MS` in `src/config/realtime.ts` is currently 1 hour (for notifications). Chat replay window should be 24 hours per AC. Add a separate config constant `CHAT_REPLAY_WINDOW_MS = 86400000` (24 hours).

### Database Schema Details

> **`notification_preference` type note:** This column stays `VARCHAR(20) DEFAULT 'all'` in this migration. Story 2.7 will define the full valid set (`'all'`, `'mentions_only'`, `'muted'`). Use `varchar({ length: 20 })` in the Drizzle schema for now; a CHECK constraint or enum conversion can be added in the Story 2.7 migration.

```sql
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
CREATE INDEX idx_chat_messages_conversation_created
  ON chat_messages (conversation_id, created_at);
CREATE INDEX idx_chat_messages_content_search
  ON chat_messages USING GIN (to_tsvector('english', content));
CREATE INDEX idx_chat_conversation_members_user
  ON chat_conversation_members (user_id);
```

### Testing Standards

- **Co-locate tests** with source files (e.g., `message-service.test.ts` next to `message-service.ts`)
- **`@vitest-environment node`** directive for all server-side test files
- **Mock patterns** from Story 1.15/1.17:
  - `vi.mock("@/env", () => ({ env: { ... } }))` for env-dependent modules
  - `vi.hoisted()` for any `vi.mock()` factory referencing outer-scope variables
  - Regular `function()` (not arrow) for mocks called with `new`
  - `vi.mock("@/services/event-bus")` for EventBus in service tests
- **Socket.IO namespace tests**: Follow pattern in `src/server/realtime/namespaces/notifications.test.ts` — use its `makeSocket()`, `makeNamespace()`, `makeRedis()` helper structure (the `chat.test.ts` file does not exist yet — it is created by this story)
- **API route tests**: Follow pattern in `src/app/api/v1/notifications/route.test.ts` (mock services, mock session)
- Test coverage targets: All MessageService methods, all namespace handlers, all API routes, block enforcement, reconnection sync logic

### Performance Considerations

- **NFR-P7**: Chat message delivery < 500ms end-to-end
- **NFR-SC4**: System processes 100+ messages per second across all channels
- **NFR-P9**: Message search results within 1 second (GIN index enables this)
- **Cursor-based pagination**: More efficient than offset for message history (no skip scans)
- **Redis pub/sub**: EventBus bridge routes messages across Socket.IO instances via Redis adapter

### What This Story Does NOT Include

- No UI components (chat window, message bubbles, etc.) — those are Story 2.2+
- No typing indicators or read receipts — Story 2.6
- No message editing/deletion — Story 2.5
- No file attachments or reactions — Story 2.4
- No message search UI — Story 2.7
- No `@mention` handling — Story 2.5
- No presence system changes — already complete from Story 1.15

### Project Structure Notes

- Alignment with unified project structure: All new files follow established conventions
- `src/db/schema/chat-conversations.ts` and `src/db/schema/chat-messages.ts` — separate schema files (matching `platform-notifications.ts` pattern, NOT a single file)
- `src/features/chat/` — new feature module following barrel export pattern from `src/features/notifications/`
- `src/services/message-service.ts` — service layer following `notification-service.ts` pattern
- `src/app/api/v1/conversations/` — REST routes following established API structure

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2 Story 2.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#Real-Time Communication]
- [Source: _bmad-output/planning-artifacts/architecture.md#Database Schema]
- [Source: _bmad-output/planning-artifacts/architecture.md#API Design]
- [Source: _bmad-output/planning-artifacts/architecture.md#Socket.IO Namespace Design]
- [Source: _bmad-output/planning-artifacts/architecture.md#Testing Standards]
- [Source: _bmad-output/implementation-artifacts/epic-1-retro-2026-02-26.md#Technical Patterns]
- [Source: _bmad-output/project-context.md#All Sections]
- [Source: src/server/realtime/namespaces/notifications.ts — reconnection sync pattern]
- [Source: src/services/notification-service.ts — EventBus listener + recipient filtering pattern]
- [Source: src/services/block-service.ts — block enforcement pattern]
- [Source: src/config/realtime.ts — room patterns + rate limits]
- [Source: src/types/events.ts — MessageSentEvent type definition]

### Previous Story Intelligence (from Story 1.17 + Epic 1 Retro)

- **Hand-write migrations always** — drizzle-kit generate fails with `server-only` error
- **`vi.hoisted()` required** for `vi.mock()` factories referencing outer-scope variables
- **Dynamic import for rate-limiter** in `withApiHandler` — prevents test cascade failures
- **Lazy initialization pattern** (used for Resend SDK in 1.17) — consider for MessageService if it has env dependencies
- **EventBus emit from services only** — never from routes or namespace handlers directly
- **`import "server-only"`** first line in all server-side service files
- **Test count baseline**: 973/973 passing (133 test files) — do NOT break existing tests
- **Epic 1 retro action**: Cap story scope at ~2 subsystems / ~100 tests
- **Epic 2 prep spikes completed**: Cursor-based pagination pattern, TanStack Query + Socket.IO optimistic update pattern

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Migration applied directly via `postgres` driver (not drizzle-kit) — same established pattern as migrations 0008-0012; journal only covers 0000-0007.
- Self-referencing FK in `chat-messages.ts` required `AnyPgColumn` type import to satisfy TypeScript strict check.
- `successResponse` signature: `(data, meta?, status?)` — 201 must be passed as 3rd arg (`undefined, 201`), not 2nd.
- Query test `chainable` helper made thenable (`.then()` bound to `Promise.resolve`) so queries without terminal `.limit()` call resolve correctly.
- `emit.mockImplementationOnce` consumed by initial `sync:request` in `useChat` — fixed by using `mockImplementation` with event-discriminated response.

### Completion Notes List

- **Task 1**: Migration `0013_chat_tables.sql` created and applied. 3 tables, 3 enums, 3 indexes verified in DB.
- **Task 2**: `chat-conversations.ts` and `chat-messages.ts` Drizzle schemas created with relations. Registered in `src/db/index.ts`. 8 schema tests.
- **Task 3**: `chat-conversations.ts` and `chat-messages.ts` query files created. `createConversation` and `createMessage` both use transactions (conversation members added atomically; `chat_conversations.updated_at` updated on message insert). `getConversationMessages` implements cursor-based pagination using `created_at` index. 17 query tests.
- **Task 4**: `MessageService` interface + `PlaintextMessageService` in `src/services/message-service.ts`. Emits `message.sent` with full payload from service (not route/handler). 11 service tests.
- **Task 5**: Full `/chat` namespace replacing skeleton. Auto-joins conversation rooms on connect. `message:send` validates membership + block status, persists via `messageService`, broadcasts `message:new`. `message:delivered` is Phase 1 no-op (ACK only). `sync:request` uses `CHAT_REPLAY_WINDOW_MS` (24h). EventBus bridge extended with `message.sent` → `message:new` routing to `/chat` namespace. 23 namespace + 5 bridge tests.
- **Task 6**: REST routes: `GET /api/v1/conversations`, `POST /api/v1/conversations`, `GET /api/v1/conversations/[conversationId]/messages`. Block enforcement on conversation creation. Cursor-based pagination on message fetch. 3 new rate limit presets. 15 API route tests.
- **Task 7**: `useChat` hook with `lastReceivedAt` tracking, `sync:request` on connect, `message:new` subscription, `sync:replay` dedup. `useConversations` with TanStack Query + Socket.IO invalidation. Types + barrel export. 12 hook tests.
- **Task 8**: `Chat` namespace added to `messages/en.json` and `messages/ig.json` (errors, system messages, status strings).
- **Test count**: 1098/1098 passing (baseline: 973/973 → +125 new tests). No regressions. No TypeScript errors in new files.

### Senior Developer Review (AI) — 2026-02-27

**Reviewer:** Dev (claude-opus-4-6)

**Issues Found:** 3 High, 4 Medium, 2 Low

**Fixes Applied (6):**

1. **[H1] Duplicate `message:new` emission** — Removed direct `ns.to().emit("message:new")` from `chat.ts` handler; EventBus bridge now handles message broadcast exclusively (prevents double delivery)
2. **[H2] Corrupted Igbo translation** — Fixed `Chat.errors.fetchFailed` in `ig.json` which contained a Korean character (`불`) in the middle of Igbo text
3. **[H3] Conversation list cursor pagination not implemented** — `getUserConversations` now returns `{ conversations, hasMore }` with actual cursor-based filtering on `updatedAt`; route updated to accept `cursor` query param and return `meta.cursor` + `meta.hasMore`
4. **[M1] Block check fails open** — `checkIfAnyMemberBlocked` now returns `true` (blocked) on DB error instead of `false`; errors are logged
5. **[M2] N+1 block check queries** — Refactored to 2 parallel queries (`getConversationMembers` + `getUsersWhoBlocked`) with Set-based intersection instead of per-member `isBlocked` calls
6. **[M3] Double-nested `data` in messages response** — Changed `{ data: messages }` to `{ messages }` inside `successResponse()` to avoid `body.data.data[...]` nesting

**Not Fixed (3 — Low priority):**

- **[M4]** Unicode escape reformatting in i18n files (cosmetic, no functional impact)
- **[L1]** `softDeleteConversation` function untested (exists for future Story 2.5 use)
- **[L2]** `sprint-status.yaml` not in story File List (workflow file, not source code)

**Test count after review:** 1100/1100 passing (+2 new review tests: cursor pagination hasMore, fail-closed block check)

### File List

- `src/db/migrations/0013_chat_tables.sql` (new)
- `src/db/schema/chat-conversations.ts` (new)
- `src/db/schema/chat-conversations.test.ts` (new)
- `src/db/schema/chat-messages.ts` (new)
- `src/db/schema/chat-messages.test.ts` (new)
- `src/db/index.ts` (modified — added chat schema imports)
- `src/db/queries/chat-conversations.ts` (new)
- `src/db/queries/chat-conversations.test.ts` (new)
- `src/db/queries/chat-messages.ts` (new)
- `src/db/queries/chat-messages.test.ts` (new)
- `src/services/message-service.ts` (new)
- `src/services/message-service.test.ts` (new)
- `src/config/realtime.ts` (modified — added `CHAT_REPLAY_WINDOW_MS`)
- `src/types/events.ts` (modified — extended `MessageSentEvent` with `content`, `contentType`, `createdAt`)
- `src/server/realtime/namespaces/chat.ts` (modified — replaced skeleton with full implementation)
- `src/server/realtime/namespaces/chat.test.ts` (modified — comprehensive tests replacing skeleton test)
- `src/server/realtime/subscribers/eventbus-bridge.ts` (modified — added `message.sent` routing)
- `src/server/realtime/subscribers/eventbus-bridge.test.ts` (modified — added `message.sent` tests + updated `makeIo` for multi-namespace)
- `src/services/rate-limiter.ts` (modified — added `CONVERSATION_LIST`, `CONVERSATION_CREATE`, `MESSAGE_FETCH` presets)
- `src/app/api/v1/conversations/route.ts` (new)
- `src/app/api/v1/conversations/route.test.ts` (new)
- `src/app/api/v1/conversations/[conversationId]/messages/route.ts` (new)
- `src/app/api/v1/conversations/[conversationId]/messages/route.test.ts` (new)
- `src/features/chat/hooks/use-chat.ts` (new)
- `src/features/chat/hooks/use-chat.test.ts` (new)
- `src/features/chat/hooks/use-conversations.ts` (new)
- `src/features/chat/hooks/use-conversations.test.ts` (new)
- `src/features/chat/types/index.ts` (new)
- `src/features/chat/index.ts` (new)
- `messages/en.json` (modified — added `Chat` namespace)
- `messages/ig.json` (modified — added `Chat` namespace)
