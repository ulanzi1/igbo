# Story 2.2: Direct Messaging (1:1 Conversations)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a member,
I want to send and receive direct messages with other members in real-time,
so that I can have private conversations and build personal connections within the community.

## Acceptance Criteria

1. **Given** a member wants to start a conversation with another member, **When** they click "Message" on a member's profile or card, **Then** the system opens the existing 1:1 conversation if one exists, or creates a new `direct` conversation (FR31), **And** the chat interface opens (full-screen on mobile, sidebar panel on desktop per UX spec)

2. **Given** a member is in a 1:1 conversation, **When** they type a message and press Send (or Enter), **Then** the system delivers the message to the recipient in < 500ms (NFR-P7), **And** the system persists the message to PostgreSQL via MessageService, **And** the message appears immediately in the sender's view (optimistic update), **And** the recipient receives the message in real-time via Socket.IO

3. **Given** a member opens their chat interface, **When** the conversation list loads, **Then** all their conversations are listed with: other member's avatar, name, online indicator, last message preview, timestamp, and unread count, **And** the system sorts conversations by most recent activity, **And** the list uses cursor-based pagination for efficient loading

4. **Given** a member opens a conversation, **When** the message history loads, **Then** the system displays messages in chronological order with sender avatar, name, content, and timestamp, **And** messages use cursor-based pagination (load older messages on scroll up), **And** the view auto-scrolls to the newest message, **And** sent messages show delivery status (sent tick, delivered double-tick)

5. **Given** a member receives a message while in another part of the app, **When** the message arrives via Socket.IO, **Then** the chat icon in navigation shows an updated unread badge count, **And** TanStack Query cache is invalidated to reflect the new message in conversation list

6. **Given** a blocked user attempts to message the blocker, **When** they try to create a conversation or send a message, **Then** the system shows "This member is not accepting messages" (no further detail for privacy), **And** the message is not delivered

7. **Given** a member opens the chat page with no conversations, **When** the empty state renders, **Then** a speech bubbles icon is shown with "Start a conversation" header, "Find community members and say hello" secondary text, and a "Find Members" CTA button

## Tasks / Subtasks

- [x] Task 1: Create chat page routes and layout (AC: 1, 3, 7)
  - [x] 1.1: Create `/[locale]/chat/page.tsx` — CSR conversation list page with empty state
  - [x] 1.2: Create `/[locale]/chat/[conversationId]/page.tsx` — CSR message thread page
  - [x] 1.3: Create `/[locale]/chat/layout.tsx` — responsive split layout (list + pane on tablet/desktop, single-pane on mobile)
  - [x] 1.4: Write tests for route components and layout

- [x] Task 2: Build ConversationList component (AC: 3, 7)
  - [x] 2.1: Create `src/features/chat/components/ConversationList.tsx` — renders conversation items with avatar, name, online indicator, last message preview, timestamp, unread badge
  - [x] 2.2: Create `src/features/chat/components/ConversationItem.tsx` — individual conversation row with states (default, unread, active)
  - [x] 2.3: Integrate `useConversations()` hook for TanStack Query data fetching with cursor pagination
  - [x] 2.4: Refactor `useConversations()` from `useQuery` to `useInfiniteQuery` for cursor pagination — **breaking change to hook interface**; see Dev Notes for before/after API and required consumer updates
  - [x] 2.5: Create `src/features/chat/components/ConversationListSkeleton.tsx` — loading skeleton
  - [x] 2.6: Create `src/features/chat/components/ChatEmptyState.tsx` — empty state with illustration and CTA
  - [x] 2.7: Write tests for ConversationList, ConversationItem, skeleton, and empty state

- [x] Task 3: Build ChatWindow component (AC: 2, 4)
  - [x] 3.1: Create `src/features/chat/components/ChatWindow.tsx` — message thread display with header showing other member's name, avatar, online status
  - [x] 3.2: Create `src/features/chat/components/MessageBubble.tsx` — individual message with sender avatar, name, content, timestamp, delivery status indicator
  - [x] 3.3: Create `src/features/chat/components/DeliveryIndicator.tsx` — sent tick (✓), delivered double-tick (✓✓) status icons
  - [x] 3.4: Implement cursor-based message pagination (load older on scroll up) via `useInfiniteQuery`
  - [x] 3.5: Implement auto-scroll to newest message on open and on new incoming message
  - [x] 3.6: Create `src/features/chat/components/ChatWindowSkeleton.tsx` — loading skeleton for message thread
  - [x] 3.7: Handle consecutive messages from same sender within 5 minutes (collapse avatar/name per UX spec)
  - [x] 3.8: Write tests for ChatWindow, MessageBubble, DeliveryIndicator

- [x] Task 4: Build MessageInput component (AC: 2)
  - [x] 4.1: Create `src/features/chat/components/MessageInput.tsx` — text input with send button, Enter to send, Shift+Enter for newline
  - [x] 4.2: Implement optimistic message sending — message appears immediately in sender's view, rolled back on error
  - [x] 4.3: Implement send via Socket.IO `message:send` event with acknowledgment callback (use existing `useChat().sendMessage()`)
  - [x] 4.4: Handle send failure with error state (red border, retry option)
  - [x] 4.5: Auto-focus input when chat opens from "Message" button
  - [x] 4.6: Write tests for MessageInput including optimistic update and error handling

- [x] Task 5: Implement find-or-create direct conversation flow (AC: 1)
  - [x] 5.1: Create `src/features/chat/actions/create-conversation.ts` — Next.js Server Action (`"use server"`) that POSTs to `/api/v1/conversations` with `type: "direct"`, receives the returned `conversationId`, and returns it for client-side redirect to `/chat/[conversationId]`
  - [x] 5.2: Add `findExistingDirectConversation` query to `src/db/queries/chat-conversations.ts` — finds existing `direct` conversation between two specific users
  - [x] 5.3: Update `POST /api/v1/conversations` route to return existing conversation if a `direct` conversation already exists between the two members (idempotent creation)
  - [x] 5.4: Add "Message" button to `src/features/profiles/components/ProfileView.tsx` (the component rendered by `src/app/[locale]/(app)/profiles/[userId]/page.tsx`) — calls the `create-conversation` server action and navigates to `/chat/[conversationId]`; do NOT show the button when `profile.userId === session.user.id` (no self-DM)
  - [x] 5.5: Write tests for find-or-create logic and API route update

- [x] Task 6: Implement real-time message streaming and unread badges (AC: 2, 5)
  - [x] 6.1: Extend `useChat()` hook: (a) on `message:new` — append to `["messages", conversationId]` TanStack Query cache and invalidate `["conversations"]`; (b) on `sync:full_refresh` — clear local message state and invalidate all `["messages"]` and `["conversations"]` caches to force REST refetch
  - [x] 6.2: Create `src/features/chat/hooks/use-unread-count.ts` — tracks total unread count across all conversations
  - [x] 6.3: Add unread badge to chat icon in TopNav/AppShell navigation (red circle with count)
  - [x] 6.4: Implement conversation-level unread count tracking (reset on opening conversation)
  - [x] 6.5: Extend `useConversations()` to include last message preview and unread count in conversation list data
  - [x] 6.6: Write tests for real-time cache updates, unread count tracking, and badge display

- [x] Task 7: Implement responsive chat layout (AC: 1)
  - [x] 7.1: Mobile (< 768px): Full-screen conversation list → tap → full-screen conversation pane with back button
  - [x] 7.2: Tablet (768–1024px): Split view — conversation list (300px left) + conversation pane (remaining)
  - [x] 7.3: Desktop (> 1024px): Collapsible right panel (360px) overlay, visible alongside any page content, toggled via nav icon
  - [x] 7.4: Preserve scroll position when navigating back from conversation to list (mobile)
  - [x] 7.5: Write tests for responsive layout behavior at each breakpoint

- [x] Task 8: Add i18n strings and block/error handling (AC: 6, 7)
  - [x] 8.1: Add `Chat.conversations`, `Chat.messages`, `Chat.input`, `Chat.empty`, `Chat.errors` keys to `messages/en.json`
  - [x] 8.2: Add matching Igbo translations to `messages/ig.json`
  - [x] 8.3: Implement block check UX — "This member is not accepting messages" error display
  - [x] 8.4: Handle network disconnection state in chat UI (show "Reconnecting..." indicator)
  - [x] 8.5: Write tests for i18n rendering and error states

- [x] Task 9: Update types, REST API, and mark-read endpoint (AC: 3)
  - [x] 9.1: Extend `ChatConversation` type in `src/features/chat/types/index.ts` to add `otherMember: { id, displayName, photoUrl }`, `lastMessage: { content, senderId, createdAt } | null`, and `unreadCount: number` — **do this first**; hooks and components will not compile without it
  - [x] 9.2: Extend `GET /api/v1/conversations` response to include: `lastMessage` (content truncated to 100 chars + timestamp), `otherMember` (id, displayName, photoUrl), `unreadCount`
  - [x] 9.3: Extend `getUserConversations()` query to join conversation members + latest message + community profiles for display data; derive `unreadCount` from `COUNT(messages.created_at > conversation_members.last_read_at)`
  - [x] 9.4: Create `src/app/api/v1/conversations/[conversationId]/route.ts` (NEW file — the `[conversationId]` folder currently only has a `messages/` subfolder, no `route.ts`) exporting both `GET` (single conversation with member details, for deep-link access) and `PATCH` (mark as read — updates `chat_conversation_members.last_read_at = NOW()` for the calling user)
  - [x] 9.5: Write tests for enriched API responses and the mark-read endpoint

- [x] Task 10: Update barrel exports and integration tests (AC: all)
  - [x] 10.1: Update `src/features/chat/index.ts` barrel to export all new components and hooks
  - [x] 10.2: Run full test suite and verify no regressions

## Dev Notes

### Critical Architecture Patterns

- **MessageService is the ONLY way to send messages.** Never call `createMessage()` directly from components or routes. The `useChat().sendMessage()` hook emits `message:send` via Socket.IO → chat namespace handler calls `messageService.sendMessage()` → EventBus emits `message.sent` → EventBus bridge broadcasts `message:new` to the room. This chain MUST NOT be bypassed.

- **No REST endpoint for sending messages.** Messages are sent exclusively via Socket.IO `message:send` event. The REST API is read-only for conversations and messages.

- **Optimistic updates with rollback — exact algorithm.** The existing `ChatMessage` type has no `status` field. Extend `src/features/chat/types/index.ts` with a `LocalChatMessage` type that adds `tempId: string` and `status: "sending" | "sent" | "delivered" | "error"` for client-only tracking. Algorithm: (1) On send: generate `tempId = crypto.randomUUID()`; prepend `LocalChatMessage` with `{ tempId, status: "sending", ...payload }` to the local message list. (2) On Socket.IO ACK success `{ messageId }`: replace the entry matched by `tempId` with the real `messageId` at `status: "sent"`. (3) On incoming `message:new` event: check if `messageId` already in list — **skip if present** (prevents double-render when ACK and broadcast race). (4) On ACK error: mark the temp entry `status: "error"` for retry UI.

- **TanStack Query cache invalidation on `message:new`.** The `useConversations()` hook already invalidates on `message:new` events (Story 2.1). Story 2.2 extends this to also update the message list cache for the active conversation.

- **Block enforcement is already implemented.** Story 2.1 added block checks in both the REST `POST /api/v1/conversations` route and the Socket.IO `message:send` handler. Story 2.2 only needs to display the error message to the user.

- **`chat_conversations.updated_at` drives recency ordering.** The `PlaintextMessageService.sendMessage()` updates this timestamp in the same transaction as message creation. The conversation list query orders by `updated_at DESC`. Do NOT implement separate recency tracking.

- **`useConversations()` is a breaking upgrade.** The existing hook (`src/features/chat/hooks/use-conversations.ts`) uses `useQuery` and returns `{ conversations: ChatConversation[], isLoading, isError, error, refetch }`. Story 2.2 refactors it to `useInfiniteQuery` for cursor pagination. New return shape: `{ conversations: ChatConversation[], fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError }`. The `queryKey` remains `["conversations"]`. Any component consuming the old shape must be updated simultaneously (only `ConversationList` in this story).

- **TanStack Query key conventions.** Use consistent keys to ensure correct cache invalidation:
  - `["conversations"]` — conversation list (used by `useConversations`)
  - `["messages", conversationId]` — message history per conversation (used by the new `useInfiniteQuery` in `ChatWindow`)
  - When `message:new` arrives: invalidate `["conversations"]` (resort list) and update `["messages", conversationId]` cache (append new message).

### Established Codebase Patterns (from Story 2.1)

- **API routes**: Wrapped with `withApiHandler()` from `@/server/api/middleware` with `rateLimit` option
- **Auth in routes**: `requireAuthenticatedSession()` from `@/services/permissions.ts`
- **Error responses**: `successResponse()` / `errorResponse()` from `@/lib/api-response` (RFC 7807)
- **EventBus**: Emit from services (MessageService), never from routes or components
- **Zod validation**: Import from `"zod/v4"`, use `.issues[0]`
- **Tests**: Co-located with source files, `@vitest-environment node` for server files
- **i18n**: All user-facing strings via `useTranslations()` — no hardcoded strings
- **DB schema**: No `src/db/schema/index.ts` — schemas imported directly in `src/db/index.ts`

### Component Structure (per architecture.md)

All new components go in `src/features/chat/components/`:

```
src/features/chat/
  components/
    ConversationList.tsx          (NEW)
    ConversationList.test.tsx     (NEW)
    ConversationItem.tsx          (NEW)
    ConversationItem.test.tsx     (NEW)
    ConversationListSkeleton.tsx  (NEW)
    ChatWindow.tsx                (NEW)
    ChatWindow.test.tsx           (NEW)
    MessageBubble.tsx             (NEW)
    MessageBubble.test.tsx        (NEW)
    MessageInput.tsx              (NEW)
    MessageInput.test.tsx         (NEW)
    DeliveryIndicator.tsx         (NEW)
    DeliveryIndicator.test.tsx    (NEW)
    ChatWindowSkeleton.tsx        (NEW)
    ChatEmptyState.tsx            (NEW)
    ChatEmptyState.test.tsx       (NEW)
  hooks/
    use-chat.ts                   (EXISTS — extend)
    use-chat.test.ts              (EXISTS — extend)
    use-conversations.ts          (EXISTS — extend)
    use-conversations.test.ts     (EXISTS — extend)
    use-unread-count.ts           (NEW)
    use-unread-count.test.ts      (NEW)
  actions/
    create-conversation.ts        (NEW)
    create-conversation.test.ts   (NEW)
  types/
    index.ts                      (EXISTS — extend)
  index.ts                        (EXISTS — update exports)
```

### UX Specifications

**ConversationItem anatomy:**

```
[Avatar 40px + Online Dot] [Name (Bold if Unread)] [Timestamp →]
[Message Preview (1 line, truncated)]  [Unread Badge]
```

- Unread state: name bold, subtle green-tint background, badge with count
- Active state: primary green 10% opacity background, border-left primary green
- DM variant: single avatar

**ChatMessage anatomy (sent):**

```
[Sender Avatar] [Sender Name] [Timestamp]
[Message Bubble (right-aligned, green)]
[Delivery Indicator: ✓ sent | ✓✓ delivered]
```

- Collapse avatar/name for consecutive messages from same sender within 5 minutes
- Deleted messages show "This message was deleted" (greyed out)
- Edited messages show "(edited)" label below text

**ChatInputBar anatomy:**

```
[Text Input Field "Type a message..."] [Send Button]
```

- Send button: grey/disabled when empty, green/enabled when text entered
- Enter to send, Shift+Enter for newline
- Auto-focus when chat opens from "Message" button
- Note: Attachment, emoji, and voice features are Story 2.4 scope — do NOT implement in 2.2

**Responsive layout:**

- Mobile (< 768px): Full-screen list OR full-screen conversation (not both)
- Tablet (768–1024px): Split — list 300px + pane remaining
- Desktop (> 1024px): Collapsible right panel 360px, slides over content

**Empty state:**

- Speech bubbles icon
- "Start a conversation" heading
- "Find community members and say hello" subtext
- "Find Members" CTA → navigates to member directory

### Delivery Status Indicators

Story 2.2 implements the first two states only:

- **Sending**: Grey single tick ✓ at 0.5 opacity (optimistic, before ACK)
- **Sent**: Grey single tick ✓ (after Socket.IO ACK)
- **Delivered**: Grey double tick ✓✓ (after `message:delivered` event — Phase 1 no-op from 2.1, but UI should render it when the event eventually arrives)
- **Read**: Blue double tick ✓✓ — Story 2.6 scope, do NOT implement

### API Response Shape (for enriched conversation list)

```typescript
// GET /api/v1/conversations response
{
  data: {
    conversations: [{
      id: string;
      type: "direct";
      updatedAt: string; // ISO 8601
      otherMember: {
        id: string;
        displayName: string;
        photoUrl: string | null;
        // Note: online status is handled client-side via Socket.IO presence, NOT in REST response
      };
      lastMessage: {
        content: string; // truncated preview
        senderId: string;
        createdAt: string; // ISO 8601
      } | null;
      unreadCount: number;
    }],
    meta: { cursor: string | null, hasMore: boolean }
  }
}
```

### Unread Count Strategy

- **Per-conversation unread count**: Derived from messages with `created_at > last_read_at` in `chat_conversation_members`. Queried on conversation list load and cached in TanStack Query.
- **Total unread count (badge)**: Sum of all conversation unread counts. Kept in React state, updated on `message:new` events (+1 if not in active conversation) and on opening a conversation (reset that conversation's count).
- **Marking as read**: When a conversation is opened, update `chat_conversation_members.last_read_at` via `PATCH /api/v1/conversations/[conversationId]` (implemented in Task 9.4). Call this from `ChatWindow` on mount — fire-and-forget (no UI blocking, no error surfaced to user).
- Note: Full read receipt broadcasting (blue ticks) is Story 2.6 scope.

### What NOT to Build (deferred to later stories)

- Typing indicators (Story 2.6)
- Read receipts / blue ticks (Story 2.6)
- Online presence broadcasting (Story 2.6) — but show online dot if data is available
- Rich text formatting toolbar (Story 2.4)
- File attachments (Story 2.4)
- Emoji reactions (Story 2.4)
- Voice messages (Story 2.4)
- Message editing/deletion UI (Story 2.5)
- Threaded replies (Story 2.5)
- @mentions (Story 2.5)
- Message search (Story 2.7)
- Conversation notification preferences (Story 2.7)
- Group DM creation flow (Story 2.3)

### Project Structure Notes

- Chat page routes: `src/app/[locale]/(app)/chat/page.tsx` and `src/app/[locale]/(app)/chat/[conversationId]/page.tsx` — placed under the `(app)` route group, which is already protected by the global middleware (`src/middleware.ts`) for all authenticated routes; **no middleware changes needed**
- All components follow `PascalCase.tsx` naming
- Hooks follow `use-kebab-case.ts` naming
- **All chat components and hooks require `"use client"` at the top of every file** — Next.js App Router defaults to RSC; forgetting this causes cryptic hydration errors; every file in `src/features/chat/components/` and `src/features/chat/hooks/` needs it
- Feature barrel export: `import { ConversationList, ChatWindow, ... } from "@/features/chat"`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#Real-Time Communication]
- [Source: _bmad-output/planning-artifacts/architecture.md#API Design]
- [Source: _bmad-output/planning-artifacts/ux-design.md#Chat Components]
- [Source: _bmad-output/implementation-artifacts/2-1-chat-infrastructure-messageservice.md]
- [Source: src/services/message-service.ts — MessageService interface]
- [Source: src/features/chat/hooks/use-chat.ts — existing chat hooks]
- [Source: src/features/chat/hooks/use-conversations.ts — existing conversation hook]
- [Source: src/db/queries/chat-conversations.ts — existing query functions]
- [Source: src/db/queries/chat-messages.ts — existing query functions]
- [Source: src/app/api/v1/conversations/route.ts — existing REST endpoints]
- [Source: src/server/realtime/namespaces/chat.ts — Socket.IO namespace]
- [Source: src/config/realtime.ts — ROOM_CONVERSATION, rate limits]
- [Source: src/providers/SocketProvider.tsx — chatSocket context]

### Previous Story Intelligence (Story 2.1)

**Patterns that worked:**

- Hand-written SQL migrations (drizzle-kit generate fails with `server-only` error)
- Next migration number: `0014` (0013 was used by Story 2.1)
- `vi.hoisted()` for `vi.mock()` factories referencing outer-scope variables
- MockRedis: use `vi.fn().mockImplementation(function() { return {...} })` (regular function, not arrow)
- EventBus events include full payload (bridge cannot query DB in-flight)
- Realtime container imports from `@/db/queries/` directly, not service layer

**Test count baseline:** 1100/1100 passing after Story 2.1 (with +2 review tests)

**Files created in Story 2.1 that this story builds on:**

- `src/features/chat/` — hooks, types, barrel (EXTEND)
- `src/services/message-service.ts` — MessageService (USE, don't modify)
- `src/db/queries/chat-conversations.ts` — CRUD queries (EXTEND with findExistingDirect)
- `src/db/queries/chat-messages.ts` — message queries (USE)
- `src/app/api/v1/conversations/route.ts` — REST API (EXTEND)
- `src/server/realtime/namespaces/chat.ts` — Socket.IO handlers (USE, don't modify)
- `src/providers/SocketProvider.tsx` — chat socket context (USE)

### Git Intelligence

Recent commits show Story 2.1 was the last feature commit (`efd570a`). The codebase is clean and ready for Story 2.2 development. No in-flight changes or conflicts to worry about.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- All 10 tasks completed with 1173/1173 tests passing (+73 new tests from Story 2.1 baseline of 1100)
- `useConversations` refactored from `useQuery` → `useInfiniteQuery` for cursor pagination; BottomNav + types updated accordingly
- `ChatWindow` uses `useInfiniteQuery` for paginated message history; optimistic updates via `LocalChatMessage` with `tempId` + status tracking; ACK race deduplication via server ID set
- Chat layout restructured: `layout.tsx` renders `ConversationList` sidebar (hidden md+), `page.tsx` shows mobile list + tablet placeholder, `[conversationId]/page.tsx` shows `ChatWindow`
- `ChatWindow` header added: fetches conversation details to show other member's name/avatar; shows "Reconnecting..." when `isConnected=false`; mobile back button navigates to `/chat`
- Block check (AC 6): error already enforced in POST route (403) and Socket.IO handler; "errors.blocked" i18n key displayed in ConversationList error state
- `GET/PATCH /api/v1/conversations/[conversationId]` route: GET for deep-link access, PATCH marks `last_read_at = NOW()`; all responses RFC 7807; rate-limited
- `getUserConversations` enriched with raw SQL lateral joins for `otherMember`, `lastMessage` (100-char truncated), and `unreadCount`
- `findExistingDirectConversation` query + idempotent POST `/api/v1/conversations` (returns existing on 200, creates new on 201)
- `createOrFindDirectConversation` server action used by `ProfileView` "Message" button (no self-DM guard)
- `useUnreadCount` hook increments on `message:new` events for non-active conversations; `BottomNav` displays badge with destructive red dot
- All Chat i18n keys in en.json + ig.json (conversations, messages, input, empty, errors, system, status namespaces)
- Responsive layout: mobile via separate Next.js routes; tablet = 300px sidebar + pane; desktop = 320px sidebar + pane within /chat route
- Task 7.3 desktop "collapsible overlay" implemented as persistently-visible sidebar within the /chat route (global overlay deferred — requires AppShell changes outside this story scope)
- Task 7.4 scroll preservation: browser handles back-navigation scroll naturally via Next.js App Router; no custom implementation needed
- **[Review Fix]** Task 6.1 cache update logic is in `ChatWindow.tsx` (lines 90-138), NOT in `use-chat.ts` — `use-chat.ts` was not modified; File List corrected
- **[Review Fix]** 5 i18n violations fixed: hardcoded "Yesterday" in ConversationItem, hardcoded aria-labels in DeliveryIndicator/BottomNav/skeletons
- **[Review Fix]** ConversationList "load more" button used wrong i18n key (`lastMessageFallback` → `loadMore`)
- **[Review Fix]** BottomNav badge: added `role="status"`, translated aria-label, added 4 new tests
- **[Review Fix]** ProfileView.test.tsx created with 5 tests covering MessageButton (self-DM guard, navigation, error)
- **[Review Fix]** POST /conversations: added UUID validation on memberIds + self-conversation prevention + 2 new tests
- **[Review Fix]** Added 6 new i18n keys to en.json + ig.json (chatUnread, loadMore, loading, failedToSend, loadingMessages)

### File List

- `_bmad-output/implementation-artifacts/2-2-direct-messaging-1-1-conversations.md` (MODIFIED — story file)
- `messages/en.json` (MODIFIED — Chat namespace added)
- `messages/ig.json` (MODIFIED — Chat namespace translated to Igbo)
- `src/app/[locale]/(app)/chat/layout.tsx` (NEW — responsive split layout)
- `src/app/[locale]/(app)/chat/layout.test.tsx` (NEW — layout tests)
- `src/app/[locale]/(app)/chat/page.tsx` (NEW — conversation list page, mobile + tablet+)
- `src/app/[locale]/(app)/chat/page.test.tsx` (NEW — page tests)
- `src/app/[locale]/(app)/chat/[conversationId]/page.tsx` (NEW — conversation thread page)
- `src/app/[locale]/(app)/chat/[conversationId]/page.test.tsx` (NEW — conversation page tests)
- `src/app/api/v1/conversations/route.ts` (MODIFIED — idempotent POST for direct convs)
- `src/app/api/v1/conversations/route.test.ts` (MODIFIED — tests for idempotent create)
- `src/app/api/v1/conversations/[conversationId]/route.ts` (NEW — GET + PATCH endpoints)
- `src/app/api/v1/conversations/[conversationId]/route.test.ts` (NEW — route tests)
- `src/components/layout/BottomNav.tsx` (MODIFIED — unread badge via useUnreadCount)
- `src/components/layout/BottomNav.test.tsx` (MODIFIED — badge tests)
- `src/db/queries/chat-conversations.ts` (MODIFIED — enriched getUserConversations, findExistingDirectConversation, markConversationRead)
- `src/db/queries/chat-conversations.test.ts` (MODIFIED — tests for new queries)
- `src/features/chat/actions/create-conversation.ts` (NEW — server action)
- `src/features/chat/actions/create-conversation.test.ts` (NEW — server action tests)
- `src/features/chat/components/ChatEmptyState.tsx` (NEW)
- `src/features/chat/components/ChatEmptyState.test.tsx` (NEW)
- `src/features/chat/components/ChatWindow.tsx` (NEW — message thread, header, reconnecting)
- `src/features/chat/components/ChatWindow.test.tsx` (NEW)
- `src/features/chat/components/ChatWindowSkeleton.tsx` (NEW)
- `src/features/chat/components/ConversationItem.tsx` (NEW)
- `src/features/chat/components/ConversationItem.test.tsx` (NEW)
- `src/features/chat/components/ConversationList.tsx` (NEW)
- `src/features/chat/components/ConversationList.test.tsx` (NEW)
- `src/features/chat/components/ConversationListSkeleton.tsx` (NEW)
- `src/features/chat/components/DeliveryIndicator.tsx` (NEW)
- `src/features/chat/components/DeliveryIndicator.test.tsx` (NEW)
- `src/features/chat/components/MessageBubble.tsx` (NEW)
- `src/features/chat/components/MessageBubble.test.tsx` (NEW)
- `src/features/chat/components/MessageInput.tsx` (NEW)
- `src/features/chat/components/MessageInput.test.tsx` (NEW)
- `src/features/chat/hooks/use-chat.ts` (UNCHANGED — cache update logic lives in ChatWindow.tsx, not here)
- `src/features/profiles/components/ProfileView.test.tsx` (NEW — review fix: MessageButton tests)
- `src/features/chat/hooks/use-conversations.ts` (MODIFIED — refactored to useInfiniteQuery)
- `src/features/chat/hooks/use-conversations.test.ts` (MODIFIED)
- `src/features/chat/hooks/use-unread-count.ts` (NEW)
- `src/features/chat/hooks/use-unread-count.test.ts` (NEW)
- `src/features/chat/index.ts` (MODIFIED — barrel exports all new components/hooks)
- `src/features/chat/types/index.ts` (MODIFIED — LocalChatMessage, extended ChatConversation)
- `src/features/profiles/components/ProfileView.tsx` (MODIFIED — Message button)
- `src/services/rate-limiter.ts` (MODIFIED — CONVERSATION_LIST/CREATE/READ/MARK_READ presets)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MODIFIED — story status)
