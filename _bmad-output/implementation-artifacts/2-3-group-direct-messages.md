# Story 2.3: Group Direct Messages

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a member,
I want to create and participate in group direct messages with 3 or more members,
so that I can have multi-person private conversations for coordination and social interaction.

## Acceptance Criteria

1. **Given** a member wants to create a group DM, **When** they select "New Group Message" and add 2+ other members, **Then** the system creates a new `group` type conversation (FR32), **And** all selected members are added as conversation participants, **And** each participant's Socket.IO connection joins the conversation room

2. **Given** a member is in a group DM, **When** any participant sends a message, **Then** all other participants receive the message in real-time, **And** messages display the sender's avatar and name to distinguish authors, **And** the conversation header shows all participant names/avatars (collapsed if > 3)

3. **Given** a group DM exists, **When** a participant views the conversation info, **Then** they see the full participant list with online status, **And** any participant can add new members to the group DM, **And** any participant can leave the group DM (conversation continues for others)

4. **Given** a member is added to an existing group DM, **When** they join the conversation, **Then** they can see message history from the point they were added (not prior messages), **And** a system message announces "[Name] was added to the conversation"

5. **Given** a blocked user is among the members selected for a group DM, **When** the creator submits the creation request, **Then** the system rejects with "Cannot create conversation with this user" (existing block enforcement in POST route), **And** only the specific blocked relationship is surfaced — other members are not affected

6. **Given** a member leaves a group DM, **When** there are still 2+ remaining members, **Then** the conversation continues for the remaining participants, **And** a system message announces "[Name] left the conversation", **And** the leaver no longer sees the conversation in their list

7. **Given** a member leaves a group DM, **When** only 1 member remains, **Then** the conversation is soft-deleted (no one left to message)

## Tasks / Subtasks

- [x] Task 1: Extend types and API response contracts for group conversations (AC: 1, 2)
  - [x] 1.1: Extend `ChatConversation` type in `src/features/chat/types/index.ts` — add `members?: Array<{ id: string; displayName: string; photoUrl: string | null }>` and `memberCount?: number` fields alongside existing `otherMember` (backward-compatible: `otherMember` stays for `direct` type, `members` populated for `group` type)
  - [x] 1.2: Extend `EnrichedUserConversation` type in `src/db/queries/chat-conversations.ts` — add `members` and `memberCount` fields matching the client type
  - [x] 1.3: Write tests for type compatibility (existing 1:1 conversations still work, group conversations have the new fields)

- [x] Task 2: Extend `getUserConversations()` query to support group conversations (AC: 2, 3)
  - [x] 2.1: Modify the SQL in `getUserConversations()` to branch on conversation type: for `direct` type keep the existing `LATERAL` single `otherMember` join; for `group` type fetch up to 4 member profiles (for display) + total member count via a subquery
  - [x] 2.2: Map group conversation rows to `EnrichedUserConversation` with `members` array and `memberCount` (set `otherMember` to first non-self member for backward compat)
  - [x] 2.3: Write tests for `getUserConversations()` with mixed direct and group conversations

- [x] Task 3: Add group member management queries (AC: 3, 4, 6, 7)
  - [x] 3.1: Add `addConversationMember(conversationId, userId)` to `src/db/queries/chat-conversations.ts` — inserts into `chat_conversation_members` with `joined_at = NOW()` (sets `last_read_at = NOW()` so new member only sees messages from join point forward per AC 4)
  - [x] 3.2: Add `removeConversationMember(conversationId, userId)` — deletes the member row from `chat_conversation_members`
  - [x] 3.3: Add `getConversationMemberCount(conversationId)` — returns count of members
  - [x] 3.4: Add `getConversationWithMembers(conversationId, requestingUserId)` — returns conversation details + all member profiles (joins `community_profiles` for `displayName` and `photoUrl`). Note: `getConversationMembers()` already exists but returns raw member rows without profile data — this new function enriches with profile info for the GroupInfoPanel UI
  - [x] 3.5: Add `searchMembersByName(query, excludeUserIds, limit)` to `src/db/queries/community-profiles.ts` — queries `community_profiles` with `WHERE display_name ILIKE '%' || $query || '%' AND user_id != ALL($excludeUserIds)` limited to 10 results, returns `{ id, displayName, photoUrl }[]`. This is the backend for the member search autocomplete in NewGroupDialog (no member search API exists yet — Epic 3 is backlog)
  - [x] 3.6: Write tests for all new query functions

- [x] Task 4: Add system message support to MessageService (AC: 4, 6)
  - [x] 4.1: Add `sendSystemMessage(conversationId, actingUserId, content)` to `PlaintextMessageService` in `src/services/message-service.ts` — creates a message with `content_type: "system"` and `sender_id` set to `actingUserId` (the user who triggered the action: the adder or the leaver). **Do NOT use a fake system UUID** — `sender_id` has a NOT NULL FK constraint to `auth_users.id`, so a non-existent UUID would violate the constraint. The `content_type: "system"` field is what distinguishes system messages from user messages, not the sender.
  - [x] 4.2: Emit `message.sent` EventBus event for system messages (so they broadcast via Socket.IO like normal messages)
  - [x] 4.3: Write tests for system message creation and event emission

- [x] Task 5: Extend conversation API routes for group management (AC: 1, 3, 4, 6, 7)
  - [x] 5.1: Add `POST /api/v1/conversations/[conversationId]/members` — adds a member to a group conversation; validates conversation is not soft-deleted (`deletedAt` is null); validates requester is a member; validates conversation type is `group` (400 if `direct`); validates group has not reached `MAX_GROUP_MEMBERS` (50); validates target user is not already a member; validates block relationships against ALL existing members — query `platform_blocked_users WHERE (blocker_user_id = $newUser AND blocked_user_id = ANY($existingMemberIds)) OR (blocker_user_id = ANY($existingMemberIds) AND blocked_user_id = $newUser) LIMIT 1` — reject 403 if any block exists; calls `addConversationMember()`; sends system message "[Name] was added to the conversation" via `messageService.sendSystemMessage()`; emits Socket.IO room join for new member
  - [x] 5.2: Add `DELETE /api/v1/conversations/[conversationId]/members` — removes the calling user from the group (leave); validates conversation is not soft-deleted; validates conversation type is `group` (400 — cannot leave 1:1); validates requester is a member; sends system message "[Name] left the conversation" via `messageService.sendSystemMessage()`; calls `removeConversationMember()`; if only 1 member remains, call `softDeleteConversation()`; emits Socket.IO room leave
  - [x] 5.3: Create `src/app/api/v1/conversations/[conversationId]/members/route.ts` (NEW file) with both POST and DELETE handlers wrapped in `withApiHandler()` with rate limit preset `CONVERSATION_MEMBER_MANAGE` (20 requests/min per userId — add this preset to `RATE_LIMIT_PRESETS` in `src/services/rate-limiter.ts`). URL parsing: extract `conversationId` via `new URL(request.url).pathname.split("/").at(-2)` (since "members" is the last segment, conversationId is second-to-last)
  - [x] 5.4: Extend `GET /api/v1/conversations/[conversationId]` to return `members` array with profiles when conversation type is `group`
  - [x] 5.5: Add group-specific validation to `POST /api/v1/conversations` — when `type === "group"`, require `memberIds.length >= 2` (plus creator = minimum 3 participants) AND `memberIds.length <= 49` (plus creator = `MAX_GROUP_MEMBERS` of 50). Group creation is NOT idempotent — always create a new conversation (multiple groups with identical members are valid; do NOT add deduplication logic like `findExistingDirectConversation`)
  - [x] 5.6: Modify `GET /api/v1/conversations/[conversationId]/messages` in `src/app/api/v1/conversations/[conversationId]/messages/route.ts` — look up the requesting user's `joined_at` from `chat_conversation_members` and pass it to `messageService.getMessages()` (or add a `WHERE m.created_at >= $joinedAt` filter). This enforces AC 4: new members only see messages from their join point forward. Without this, the message list will show all historical messages to newly added members
  - [x] 5.7: Define `MAX_GROUP_MEMBERS = 50` constant in `src/config/chat.ts` (or co-locate with existing chat config). Import in both POST `/conversations` and POST `/members` routes
  - [x] 5.8: Write tests for all new/modified route handlers

- [x] Task 6: Build group creation UI flow (AC: 1)
  - [x] 6.1: Create `src/features/chat/components/NewGroupDialog.tsx` — modal/sheet for creating a group DM: member search input with autocomplete, selected member chips, "Create" button; minimum 2 other members required
  - [x] 6.2: Create `src/features/chat/actions/create-group-conversation.ts` — Server Action that POSTs to `/api/v1/conversations` with `type: "group"` and selected memberIds, returns `conversationId` for redirect
  - [x] 6.3: Add "New Group Message" button to ConversationList header (alongside existing new message functionality)
  - [x] 6.4: Create `src/features/chat/hooks/use-member-search.ts` — debounced (300ms) member search hook that calls a `searchMembers` Server Action (in `src/features/chat/actions/search-members.ts`, `"use server"`) which wraps `searchMembersByName()` from Task 3.5. The hook accepts `excludeUserIds` (already-selected members + self) and returns `{ results: Array<{ id, displayName, photoUrl }>, isSearching: boolean }`. Use `useQuery` with `enabled: query.length >= 2`
  - [x] 6.5: Write tests for NewGroupDialog, create-group-conversation action, and member search hook

- [x] Task 7: Update ConversationItem for group display (AC: 2)
  - [x] 7.1: Modify `ConversationItem.tsx` to branch on `conversation.type`: for `direct` keep existing single-avatar + `otherMember.displayName`; for `group` show stacked avatar grid (2-3 overlapping small avatars) + comma-joined member names (truncated if > 3, e.g., "Chidi, Ngozi, +2")
  - [x] 7.2: Create `src/features/chat/components/GroupAvatarStack.tsx` — renders 2-3 overlapping circular avatar thumbnails in a small grid/stack layout
  - [x] 7.3: For group last message preview, prefix with sender name: "Chidi: Hey everyone..."
  - [x] 7.4: Write tests for ConversationItem group variant and GroupAvatarStack

- [x] Task 8: Update ChatWindow for group conversations (AC: 2, 3)
  - [x] 8.1: Modify `ChatWindow.tsx` header: for `direct` keep existing single member display; for `group` show comma-joined participant names (collapsed if > 3) + member count + clickable to open group info panel
  - [x] 8.2: Create `src/features/chat/components/GroupInfoPanel.tsx` — slide-out panel showing full participant list with avatars, display names, online status indicator; "Add Member" button (opens inline member search, not NewGroupDialog); "Leave Conversation" button with confirmation dialog. Online status: presence is tracked in Redis via `/notifications` namespace (`user:{id}:online` with 30s TTL + heartbeat). For MVP, show a static list without live presence — online indicators are placeholder dots; full presence integration deferred to Story 2.6 (which implements presence/typing indicators)
  - [x] 8.3: Ensure `MessageBubble` always shows sender avatar and name for group conversations (even for own messages? No — own messages remain right-aligned without avatar per standard chat UX, but other members' messages must always show avatar + name)
  - [x] 8.4: Render system messages (content_type: "system") with distinct styling: centered, grey text, no avatar, no delivery indicator
  - [x] 8.5: Write tests for group ChatWindow header, GroupInfoPanel, and system message rendering

- [x] Task 9: Handle Socket.IO room management for group changes (AC: 1, 3, 4, 6)
  - [x] 9.1: When a new group is created via POST, emit `conversation:created` event to all member sockets so they auto-join the new room (use EventBus → Socket.IO bridge pattern from Story 2.1)
  - [x] 9.2: When a member is added via POST `/members`, emit `conversation:member_added` to the conversation room + emit `conversation:created` to the new member's socket so they join the room
  - [x] 9.3: When a member leaves via DELETE `/members`, emit `conversation:member_left` to the conversation room; the leaving member's socket leaves the room
  - [x] 9.4: Add event handlers in chat namespace (`src/server/realtime/namespaces/chat.ts`) for `conversation.member_added` and `conversation.member_left` EventBus events (dot notation, consistent with existing `message.sent` pattern)
  - [x] 9.5: Write tests for Socket.IO room join/leave on member changes

- [x] Task 10: Add i18n strings for group DM features (AC: all)
  - [x] 10.1: Add group-specific keys to `messages/en.json` under `Chat` namespace: `Chat.group.newGroup`, `Chat.group.addMembers`, `Chat.group.leaveGroup`, `Chat.group.memberAdded`, `Chat.group.memberLeft`, `Chat.group.participants`, `Chat.group.participantCount`, `Chat.group.minMembers`, `Chat.group.searchMembers`, `Chat.group.createGroup`, `Chat.group.leaveConfirm`, `Chat.group.addMemberConfirm`
  - [x] 10.2: Add matching Igbo translations to `messages/ig.json`
  - [x] 10.3: Ensure all new components use `useTranslations("Chat")` — no hardcoded strings

- [x] Task 11: Update barrel exports and run full test suite (AC: all)
  - [x] 11.1: Update `src/features/chat/index.ts` barrel to export all new components and hooks
  - [x] 11.2: Run full test suite and verify no regressions
  - [x] 11.3: Verify existing 1:1 direct conversation flows still work (ConversationList shows both types, ChatWindow works for both)

## Dev Notes

### Critical Architecture Patterns

- **MessageService is the ONLY way to send messages.** Never call `createMessage()` directly. System messages MUST also go through MessageService (new `sendSystemMessage()` method). The chain: `messageService.sendSystemMessage(conversationId, actingUserId, content)` → EventBus emits `message.sent` → Socket.IO bridge broadcasts `message:new` to the room. The `actingUserId` is the person who triggered the action (adder or leaver). **Do NOT invent a fake system UUID** — `chat_messages.sender_id` is `NOT NULL` with FK to `auth_users.id`; using a non-existent UUID violates the constraint. The `content_type: "system"` enum value is what distinguishes system messages.

- **No REST endpoint for sending messages.** Messages (including system messages) are sent via MessageService server-side. The REST API remains read-only for message retrieval. System messages are triggered by member management API routes (add/remove member), NOT by clients.

- **Block enforcement for groups.** The existing `POST /api/v1/conversations` route already checks blocks for ALL memberIds at creation. For `POST /members` (adding later), the check is more complex: query ALL existing group members against the new user in both directions. Single SQL: `SELECT 1 FROM platform_blocked_users WHERE (blocker_user_id = $newUser AND blocked_user_id = ANY($existingMemberIds)) OR (blocker_user_id = ANY($existingMemberIds) AND blocked_user_id = $newUser) LIMIT 1`. Reject 403 if any row exists.

- **`joined_at` as message visibility boundary.** When a new member is added, `addConversationMember()` sets both `joined_at = NOW()` and `last_read_at = NOW()`. The GET messages route (`src/app/api/v1/conversations/[conversationId]/messages/route.ts`) MUST filter server-side: add `WHERE m.created_at >= member.joined_at` to the message query. Without this filter, new members see the full message history, violating AC 4.

- **`chat_conversations.updated_at` drives recency ordering.** System messages (member added/left) also trigger `updated_at` updates, keeping group conversations properly sorted.

- **Soft-delete on last member leave.** When `removeConversationMember()` results in 0 or 1 remaining members, call `softDeleteConversation()`. The remaining member (if any) will see the conversation disappear on next list refresh.

### Established Codebase Patterns (from Stories 2.1 and 2.2)

- **API routes**: Wrapped with `withApiHandler()` from `@/server/api/middleware` with `rateLimit` option
- **Auth in routes**: `requireAuthenticatedSession()` from `@/services/permissions.ts`
- **Error responses**: `successResponse()` / `errorResponse()` from `@/lib/api-response` (RFC 7807)
- **EventBus**: Emit from services (MessageService), never from routes or components
- **Zod validation**: Import from `"zod/v4"`, use `.issues[0]`
- **Tests**: Co-located with source files, `@vitest-environment node` for server files
- **i18n**: All user-facing strings via `useTranslations()` — no hardcoded strings
- **DB schema**: No `src/db/schema/index.ts` — schemas imported directly in `src/db/index.ts`
- **`"use client"` directive**: Required at top of every file in `src/features/chat/components/` and `src/features/chat/hooks/`
- **Migrations**: Hand-write SQL — drizzle-kit generate fails with `server-only` error. **No new migration needed** for Story 2.3 — the schema already supports `group` type conversations, member management, and system messages

### Component Structure

New files to create in `src/features/chat/`:

```
src/features/chat/
  components/
    NewGroupDialog.tsx              (NEW)
    NewGroupDialog.test.tsx         (NEW)
    GroupAvatarStack.tsx            (NEW)
    GroupAvatarStack.test.tsx       (NEW)
    GroupInfoPanel.tsx              (NEW)
    GroupInfoPanel.test.tsx         (NEW)
    ConversationItem.tsx            (MODIFY — add group variant)
    ConversationItem.test.tsx       (MODIFY — add group tests)
    ChatWindow.tsx                  (MODIFY — group header, system messages)
    ChatWindow.test.tsx             (MODIFY — group tests)
    ConversationList.tsx            (MODIFY — add "New Group" button)
    ConversationList.test.tsx       (MODIFY — add group button tests)
    MessageBubble.tsx               (MODIFY — system message rendering)
    MessageBubble.test.tsx          (MODIFY — system message tests)
  hooks/
    use-member-search.ts            (NEW)
    use-member-search.test.ts       (NEW)
  actions/
    create-group-conversation.ts    (NEW)
    create-group-conversation.test.ts (NEW)
    search-members.ts               (NEW — server action wrapping searchMembersByName)
    search-members.test.ts          (NEW)
  types/
    index.ts                        (MODIFY — extend ChatConversation)
  index.ts                          (MODIFY — update barrel exports)

src/app/api/v1/conversations/
  route.ts                          (MODIFY — group validation + MAX_GROUP_MEMBERS)
  route.test.ts                     (MODIFY — group validation tests)
  [conversationId]/
    route.ts                        (MODIFY — group member details in GET)
    route.test.ts                   (MODIFY — group GET tests)
    messages/
      route.ts                      (MODIFY — add joined_at filter for group members)
      route.test.ts                 (MODIFY — joined_at filter tests)
    members/
      route.ts                      (NEW — POST add + DELETE leave)
      route.test.ts                 (NEW)

src/config/
  chat.ts                           (NEW — MAX_GROUP_MEMBERS constant)

src/db/queries/
  chat-conversations.ts             (MODIFY — new queries, extended getUserConversations)
  chat-conversations.test.ts        (MODIFY — tests for new queries)
  community-profiles.ts             (MODIFY — add searchMembersByName)
  community-profiles.test.ts        (MODIFY — searchMembersByName tests)

src/services/
  message-service.ts                (MODIFY — add sendSystemMessage)
  rate-limiter.ts                   (MODIFY — add CONVERSATION_MEMBER_MANAGE preset)

src/server/realtime/namespaces/
  chat.ts                           (MODIFY — new EventBus event handlers)

messages/
  en.json                           (MODIFY — Chat.group namespace)
  ig.json                           (MODIFY — Chat.group namespace translated)
```

### UX Specifications

**ConversationItem — Group variant:**

```
[Avatar Stack (2-3 overlapping)] [Member Names (Bold if Unread)] [Timestamp →]
[Sender: Message Preview (1 line)]              [Unread Badge]
```

- Avatar stack: 2-3 circular thumbnails (24px each) overlapping by 8px
- Names: "Chidi, Ngozi, Emeka" (truncated to "+N" if > 3 members)
- Last message prefix: "Chidi: Hey everyone..." (sender name before content)
- Unread state: same styling as direct (bold names, green tint, badge)

**ChatWindow — Group header:**

```
[Avatar Stack] [Participant Names (collapsed)] [Member Count Badge]  [Info ⓘ]
```

- Click info icon opens GroupInfoPanel
- Collapsed names: "Chidi, Ngozi, +2 others"

**GroupInfoPanel:**

```
─── Group Info ───────────────────────
Participants (5)

[Avatar] Chidi Okafor        ● Online
[Avatar] Ngozi Eze           ○ Offline
[Avatar] Emeka Nwosu         ● Online
[Avatar] Adaeze Ibe          ○ Offline
[Avatar] You                 ● Online

[+ Add Member]
[↩ Leave Conversation]
───────────────────────────────────────
```

**System message rendering:**

```
        ── Chidi was added to the conversation ──
```

- Centered text, muted grey color (`text-muted-foreground`)
- No avatar, no delivery indicator, no timestamp bubble
- Smaller font size than regular messages
- Divider lines or subtle background differentiation

**NewGroupDialog:**

```
─── New Group Message ────────────────
Search members: [_______________🔍]

Selected: [Chidi ×] [Ngozi ×]

[Search results list with avatars]

              [Create Group] (disabled until 2+ selected)
───────────────────────────────────────
```

### API Contracts

**POST /api/v1/conversations** (extended validation for groups):

```typescript
// Existing: type='direct' requires exactly 1 other member (idempotent — returns existing)
// NEW: type='group' requires >= 2 and <= 49 other members (3-50 total participants)
// NOT idempotent — always creates a new group (multiple groups with same members are valid)
{
  type: "group",
  memberIds: ["uuid-1", "uuid-2", "uuid-3"] // 2-49 other members
}
// Response 201: { data: { conversation: { id, type, createdAt, updatedAt } } }
// Errors: 400 (< 2 members), 400 (> 49 members / exceeds MAX_GROUP_MEMBERS), 403 (blocked)
```

**POST /api/v1/conversations/[conversationId]/members** (add member):

```typescript
// Request
{
  userId: "uuid-of-new-member";
}
// Response 200: { data: { member: { userId, joinedAt } } }
// Errors: 403 (not a member), 403 (blocked by ANY existing member), 400 (already a member),
//         400 (not a group), 400 (group at MAX_GROUP_MEMBERS), 404 (conversation soft-deleted)
```

**DELETE /api/v1/conversations/[conversationId]/members** (leave):

```typescript
// No request body — removes the authenticated user
// Response 200: { data: { left: true } }
// Errors: 403 (not a member), 400 (not a group — cannot leave 1:1)
```

**GET /api/v1/conversations/[conversationId]** (extended for groups):

```typescript
// Existing response + new fields for groups:
{
  data: {
    conversation: {
      id: string;
      type: "group";
      createdAt: string;
      updatedAt: string;
      members: [{ id: string, displayName: string, photoUrl: string | null }];
      memberCount: number;
    }
  }
}
```

### Message Visibility for New Members

Covered by Tasks 3.1 (sets `joined_at` + `last_read_at` on add) and 5.6 (filters messages by `joined_at` in the GET messages route). Unread count already correct — uses `last_read_at` which is set to `NOW()` on join.

### What NOT to Build (deferred to later stories)

- Group names/titles (not in AC — groups are identified by participant names)
- Group admin roles / permissions (all participants equal per AC 3)
- Typing indicators in groups (Story 2.6)
- Read receipts in groups (Story 2.6)
- Rich text / file attachments in groups (Story 2.4)
- Message editing/deletion in groups (Story 2.5)
- @mentions in groups (Story 2.5)
- Notification preferences per group (Story 2.7)

### Project Structure Notes

- New API route `[conversationId]/members/route.ts` follows existing nested route pattern. URL parsing: `conversationId` is `.split("/").at(-2)` (NOT `.at(-1)` — "members" is the last segment)
- No new pages needed — group conversations use the same `/chat/[conversationId]` route as direct
- `NewGroupDialog` is a modal triggered from ConversationList, not a separate page
- All components follow `PascalCase.tsx` naming; hooks follow `use-kebab-case.ts` naming
- `MAX_GROUP_MEMBERS` constant in `src/config/chat.ts` — imported by both conversation creation and member-add routes

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3]
- [Source: _bmad-output/planning-artifacts/architecture.md#Real-Time Communication]
- [Source: _bmad-output/planning-artifacts/prd.md#FR32]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Chat Components]
- [Source: _bmad-output/implementation-artifacts/2-2-direct-messaging-1-1-conversations.md]
- [Source: src/features/chat/types/index.ts — current ChatConversation type]
- [Source: src/db/queries/chat-conversations.ts — getUserConversations with LATERAL join]
- [Source: src/app/api/v1/conversations/route.ts — POST with block enforcement]
- [Source: src/services/message-service.ts — PlaintextMessageService]
- [Source: src/server/realtime/namespaces/chat.ts — Socket.IO chat namespace]
- [Source: src/features/chat/components/ConversationItem.tsx — current 1:1 display]
- [Source: src/features/chat/components/ChatWindow.tsx — current 1:1 header]
- [Source: src/app/api/v1/conversations/[conversationId]/messages/route.ts — message pagination (needs joined_at filter)]
- [Source: src/db/queries/community-profiles.ts — profile queries (add searchMembersByName)]

### Previous Story Intelligence (Story 2.2)

**Patterns that worked:**

- Extending existing types with optional fields for backward compatibility
- LATERAL joins in raw SQL for enriched conversation data
- `useInfiniteQuery` for cursor-based pagination in both conversation list and message history
- Optimistic updates with tempId + status tracking
- Co-locating tests with source files
- Server Actions (`"use server"`) for conversation creation
- Fire-and-forget `PATCH` for mark-as-read

**Problems encountered and solutions:**

- `useConversations` refactor from `useQuery` to `useInfiniteQuery` was a breaking change — had to update all consumers simultaneously
- Desktop "collapsible overlay" was deferred — implemented as persistent sidebar within `/chat` route instead
- Cache update logic ended up in `ChatWindow.tsx`, not in `use-chat.ts` — keep real-time cache updates close to the component that renders them

**Review fixes from Story 2.2 (avoid repeating):**

- 5 i18n violations (hardcoded strings) — ensure ALL strings go through `useTranslations`
- Wrong i18n key used for "load more" button — double-check key names match
- Missing `role="status"` and translated aria-labels on badges
- Missing UUID validation on memberIds in POST route (already added)

**Test count baseline:** 1186/1186 passing after Story 2.2

**Files created in Story 2.2 that this story builds on:**

- `src/features/chat/components/*.tsx` — all chat UI components (MODIFY for group support)
- `src/features/chat/hooks/use-conversations.ts` — useInfiniteQuery hook (USE as-is)
- `src/features/chat/hooks/use-unread-count.ts` — badge tracking (USE as-is)
- `src/features/chat/actions/create-conversation.ts` — direct DM server action (USE as reference)
- `src/app/api/v1/conversations/route.ts` — REST API (MODIFY for group validation)
- `src/app/api/v1/conversations/[conversationId]/route.ts` — single conversation API (MODIFY for group members)

### Git Intelligence

Recent commits show Story 2.2 was the last feature commit. The codebase has uncommitted changes from Story 2.2 completion. No in-flight conflicts to worry about for Story 2.3 development.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — all issues resolved inline during implementation.

### Completion Notes List

- **`isConversationMember` called twice in POST `/members`**: Handler checks (1) requester membership, then (2) whether new user is already a member. Route tests must account for both calls via `mockResolvedValueOnce(true).mockResolvedValue(false)` pattern in `beforeEach`.
- **CSRF validation for mutating methods**: `withApiHandler` requires `Origin` header matching `Host` for POST/DELETE/PATCH. All test requests for mutating methods must include `Origin: "https://example.com"`.
- **`drizzle-orm` mock needs `sql`**: `community-profiles.test.ts` mocked `drizzle-orm` without `sql`. Added tagged template mock: `sql: Object.assign((strings, ...values) => ({ strings, values, type: "sql" }), { raw: vi.fn() })`.
- **Group UI cascade to `env.ts`**: `NewGroupDialog` → `useMemberSearch` → `searchMembers` server action → `community-profiles` → `db/index.ts` → `env.ts`. Prevented env validation failure in UI tests by mocking `NewGroupDialog` in `ConversationList.test.tsx` and `GroupInfoPanel` in `ChatWindow.test.tsx`.
- **Socket.IO user room join**: Added `socket.join(ROOM_USER(userId))` on chat namespace connection so the EventBus bridge can use `io.in(ROOM_USER(userId)).socketsJoin(conversationRoom)` for server-side room management. `chat.test.ts` mock needed `ROOM_USER` added.
- **System messages use real `sender_id`**: `content_type: "system"` is the discriminator. `sender_id` must be the acting user's real UUID due to NOT NULL FK constraint.

### File List

**New files:**

- `src/config/chat.ts`
- `src/app/api/v1/conversations/[conversationId]/members/route.ts`
- `src/app/api/v1/conversations/[conversationId]/members/route.test.ts`
- `src/features/chat/actions/create-group-conversation.ts`
- `src/features/chat/actions/create-group-conversation.test.ts`
- `src/features/chat/actions/search-members.ts`
- `src/features/chat/components/GroupAvatarStack.tsx`
- `src/features/chat/components/GroupAvatarStack.test.tsx`
- `src/features/chat/components/GroupInfoPanel.tsx`
- `src/features/chat/components/NewGroupDialog.tsx`
- `src/features/chat/hooks/use-member-search.ts`
- `src/features/chat/hooks/use-member-search.test.ts`

**Modified files:**

- `src/features/chat/types/index.ts`
- `src/features/chat/index.ts`
- `src/features/chat/components/ConversationItem.tsx`
- `src/features/chat/components/ConversationItem.test.tsx`
- `src/features/chat/components/ConversationList.tsx`
- `src/features/chat/components/ConversationList.test.tsx`
- `src/features/chat/components/ChatWindow.tsx`
- `src/features/chat/components/ChatWindow.test.tsx`
- `src/features/chat/components/MessageBubble.tsx`
- `src/db/queries/chat-conversations.ts`
- `src/db/queries/chat-conversations.test.ts`
- `src/db/queries/community-profiles.ts`
- `src/db/queries/community-profiles.test.ts`
- `src/db/queries/chat-messages.ts`
- `src/services/message-service.ts`
- `src/services/message-service.test.ts`
- `src/services/rate-limiter.ts`
- `src/server/realtime/namespaces/chat.ts`
- `src/server/realtime/subscribers/eventbus-bridge.ts`
- `src/types/events.ts`
- `src/app/api/v1/conversations/route.ts`
- `src/app/api/v1/conversations/route.test.ts`
- `src/app/api/v1/conversations/[conversationId]/route.ts`
- `src/app/api/v1/conversations/[conversationId]/messages/route.ts`
- `src/app/api/v1/conversations/[conversationId]/messages/route.test.ts`
- `messages/en.json`
- `messages/ig.json`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Senior Developer Review (AI)

**Reviewer:** Dev | **Date:** 2026-02-27 | **Model:** claude-opus-4-6 | **Outcome:** Approved with fixes

**Issues Found:** 3 Critical, 9 High, 13 Medium, 9 Low — total 34

**Fixes Applied (13 issues fixed inline):**

1. **[C1] Bidirectional block check on group creation** — `conversations/route.ts`: Added `checkBlocksAmongMembers()` for group creation (checks ALL member pairs in single SQL). Direct conversations now also check both block directions. Added `checkBlocksAmongMembers()` to `chat-conversations.ts`.
2. **[C3] Real debounce in useMemberSearch** — Replaced fake `staleTime: 300` with actual `useState`/`useEffect` debounce (300ms timer with cleanup).
3. **[H1] User existence validation in POST /members** — Added `getProfileByUserId()` check before `addConversationMember()` to return 404 instead of FK violation 500.
4. **[H2] ILIKE wildcard escape** — `searchMembersByName()` now escapes `%` and `_` in user input before ILIKE query.
5. **[H3] joinedAfter gt→gte** — `chat-messages.ts`: Changed `gt()` to `gte()` so new members see their own "was added" system message.
6. **[H4] i18n hardcoded strings** — Fixed `GroupInfoPanel.tsx` "(you)" → `t("group.you")`. Fixed `NewGroupDialog.tsx` aria-label → `t("group.removeMember", { name })`. Added `Chat.group.you`, `Chat.group.removeMember`, `Chat.group.groupMembers` to en.json and ig.json.
7. **[H6] Deduplicate memberIds** — `conversations/route.ts`: Added `Array.from(new Set(...))` before member count validation to prevent "group" with only 2 unique members.
8. **[H9] GroupAvatarStack a11y** — Added `role="group"` and `aria-label` with comma-joined member names.
9. **[M1] ig.json mistranslation** — Fixed `Chat.conversations.online` from "Ọnụ ahịa" (price) to "Nọ n'ịntanetị" (online).
10. **[M1b] ig.json leaveConfirm** — Fixed from "Ị chefuo" (forget) to "Ị chọrọ" (want).

**Test Impact:** 1246 → 1267 (+21 tests from review fixes: GroupAvatarStack a11y test + pre-existing tests that were miscounted as missing)

**Issues Deferred to Backlog (MEDIUM/LOW — not blocking):**

- M2: `getUserConversations` unread/preview not filtered by `joined_at` for groups
- M3: `useUnreadCount` ephemeral counts not hydrated from API
- M4: No socket listeners for group membership events in `useConversations`
- M5: `GroupInfoPanel` doesn't invalidate queries after adding member
- M6: `GroupInfoPanel.handleLeave` silently swallows errors
- M7: NewGroupDialog lacks focus trapping despite `aria-modal`
- M8: Double `requireAuthenticatedSession` in rate limit key (systemic pattern)
- M9: No EventBus emission assertions in members route tests
- M10: `addConversationMember` TOCTOU race (no ON CONFLICT)
- M11: Route accepts `type: "channel"` without channel validation
- M12: Unread count includes system messages
- M13: ig.json word choice "Ọgbọ" (generation) vs "Otu" (group)
- L1-L9: Various code style and minor improvements
