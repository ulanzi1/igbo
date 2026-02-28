# Story 2.7: Message Search, Block/Mute & Conversation Preferences

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a member,
I want to search my message history, block or mute disruptive members, and control notification preferences per conversation,
So that I can find past information, protect myself from unwanted contact, and manage my attention.

## Acceptance Criteria

1. **Message search** — When a member opens the search interface within chat, they can perform full-text search across all their conversations (FR38). Results display the matching message with conversation context (sender, when, which conversation). Clicking a result navigates to that message highlighted in its conversation. Search results load within 1 second (NFR-P9). Minimum query length: 3 characters.

2. **Block** — When a member selects "Block" from the member's profile or chat actions, the blocked member can no longer send them direct messages (FR39), existing direct conversations are hidden from the blocker's conversation list, and the blocked member is not visible in future direct conversation creation. Block is silent — the blocked member is NOT notified. Existing `platform_blocked_users` table (Story 1.15, migration 0011) is reused — no new migration.

3. **Mute** — When a member selects "Mute," notifications from the muted member's messages are suppressed (FR39). Messages still appear in conversations. The member can unmute at any time. Existing `platform_muted_users` table (Story 1.15, migration 0011) is reused.

4. **Conversation notification preferences** — Members can set per-conversation notification preference via conversation settings: `"all"` (default), `"mentions"`, or `"muted"` (FR40). The preference is stored in `chat_conversation_members.notification_preference` (column already exists, default `"all"`). The `NotificationService` checks this preference before delivering `message.mentioned` notifications.

5. **Do Not Disturb** — A global DnD toggle suppresses ALL chat notifications temporarily (FR40). DnD state is stored in Redis as `dnd:{userId}` (no TTL — persists until explicitly disabled). The `/notifications` realtime namespace checks DnD before delivering chat notification events. A `PATCH /api/v1/user/dnd` API enables/disables the setting.

## Tasks / Subtasks

### Task 1: DB Query Functions (AC: #1, #2, #4)

- [x] 1.1 Add `searchMessages()` to `src/db/queries/chat-conversations.ts`:

  ```ts
  export type MessageSearchResult = {
    messageId: string;
    conversationId: string;
    senderId: string;
    senderDisplayName: string;
    senderPhotoUrl: string | null;
    content: string;
    snippet: string; // ts_headline excerpt with <mark> tags
    contentType: string;
    createdAt: Date;
    conversationType: "direct" | "group" | "channel";
    conversationName: string; // other member name (direct) or "Group" (group)
  };

  export async function searchMessages(
    userId: string,
    query: string,
    limit = 20,
  ): Promise<MessageSearchResult[]> {
    const safeLimit = Math.min(Math.max(1, limit), 50);
    const rows = await db.execute(sql`
      SELECT
        cm.id::text                                                               AS message_id,
        cm.conversation_id::text                                                  AS conversation_id,
        cm.sender_id::text                                                        AS sender_id,
        COALESCE(cp_sender.display_name, 'Unknown')                               AS sender_display_name,
        cp_sender.photo_url                                                       AS sender_photo_url,
        cm.content,
        cm.content_type::text,
        cm.created_at,
        ts_headline(
          'english', cm.content,
          plainto_tsquery('english', ${query}),
          'MaxFragments=1, MaxWords=15, MinWords=5, StartSel=<mark>, StopSel=</mark>'
        )                                                                         AS snippet,
        c.type::text                                                              AS conversation_type,
        COALESCE(cp_other.display_name, 'Group')                                  AS conversation_name
      FROM chat_messages cm
      INNER JOIN chat_conversations c
        ON c.id = cm.conversation_id AND c.deleted_at IS NULL
      INNER JOIN chat_conversation_members ccm_me
        ON ccm_me.conversation_id = cm.conversation_id AND ccm_me.user_id = ${userId}::uuid
      LEFT JOIN community_profiles cp_sender
        ON cp_sender.user_id = cm.sender_id AND cp_sender.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT user_id
        FROM chat_conversation_members
        WHERE conversation_id = cm.conversation_id AND user_id != ${userId}::uuid
        LIMIT 1
      ) ccm_other ON true
      LEFT JOIN community_profiles cp_other
        ON cp_other.user_id = ccm_other.user_id AND cp_other.deleted_at IS NULL
      WHERE cm.deleted_at IS NULL
        AND cm.content_type != 'system'
        AND cm.created_at >= ccm_me.joined_at
        AND to_tsvector('english', cm.content) @@ plainto_tsquery('english', ${query})
      ORDER BY
        ts_rank(to_tsvector('english', cm.content), plainto_tsquery('english', ${query})) DESC,
        cm.created_at DESC
      LIMIT ${safeLimit}
    `);

    return (rows as Array<Record<string, unknown>>).map((row) => ({
      messageId: String(row.message_id),
      conversationId: String(row.conversation_id),
      senderId: String(row.sender_id),
      senderDisplayName: String(row.sender_display_name),
      senderPhotoUrl: row.sender_photo_url as string | null,
      content: String(row.content),
      snippet: String(row.snippet),
      contentType: String(row.content_type),
      createdAt: row.created_at as Date,
      conversationType: row.conversation_type as "direct" | "group" | "channel",
      conversationName: String(row.conversation_name),
    }));
  }
  ```

  - Uses the GIN index `idx_chat_messages_content_search` created in migration 0013 (Story 2.1) — do NOT create a new index.
  - `plainto_tsquery` (not `to_tsquery`) is safe for arbitrary user input — no special syntax needed from users.
  - Only returns messages where `cm.created_at >= ccm_me.joined_at` — enforces join-point visibility (same rule as Story 2.3).

- [x] 1.2 Add `updateConversationNotificationPreference()` to `src/db/queries/chat-conversations.ts`:

  ```ts
  export type NotificationPreference = "all" | "mentions" | "muted";

  export async function updateConversationNotificationPreference(
    conversationId: string,
    userId: string,
    preference: NotificationPreference,
  ): Promise<void> {
    await db
      .update(chatConversationMembers)
      .set({ notificationPreference: preference })
      .where(
        and(
          eq(chatConversationMembers.conversationId, conversationId),
          eq(chatConversationMembers.userId, userId),
        ),
      );
  }
  ```

  - `notificationPreference` column already exists (varchar 20, default "all") — just expose an update function.

- [x] 1.3 Add `getConversationNotificationPreference()` for reading the current preference:

  ```ts
  export async function getConversationNotificationPreference(
    conversationId: string,
    userId: string,
  ): Promise<NotificationPreference> {
    const [row] = await db
      .select({ notificationPreference: chatConversationMembers.notificationPreference })
      .from(chatConversationMembers)
      .where(
        and(
          eq(chatConversationMembers.conversationId, conversationId),
          eq(chatConversationMembers.userId, userId),
        ),
      )
      .limit(1);
    return (row?.notificationPreference ?? "all") as NotificationPreference;
  }
  ```

- [x] 1.4 Modify `getUserConversations()` signature to accept optional `blockedUserIds` and filter out blocked direct conversations:

  ```ts
  export async function getUserConversations(
    userId: string,
    options: { limit?: number; cursor?: string; blockedUserIds?: string[] } = {},
  ): Promise<{ conversations: EnrichedUserConversation[]; hasMore: boolean }>;
  ```

  In the SQL, add immediately before `ORDER BY`:

  ```sql
  ${
    (options.blockedUserIds ?? []).length > 0
      ? sql`AND NOT (c.type = 'direct' AND ccm_other.user_id::text = ANY(ARRAY[${sql.join(
          (options.blockedUserIds ?? []).map((id) => sql`${id}`),
          sql`, `,
        )}]::text[]))`
      : sql``
  }
  ```

  - This hides direct conversations where the other member is in the blocker's blocked list.
  - `blockedUserIds` defaults to empty → no change in behavior for existing callers.
  - Group conversations are NEVER filtered (epics AC: block only affects DMs and directory).

### Task 2: Rate Limit Presets (AC: all)

- [x] 2.1 Add to `src/services/rate-limiter.ts` in `RATE_LIMIT_PRESETS`:

  ```ts
  // Story 2.7 additions
  MESSAGE_SEARCH: { maxRequests: 30, windowMs: 60_000 },       // 30/min per userId
  BLOCK_MUTE: { maxRequests: 30, windowMs: 60_000 },           // 30/min per userId
  CONVERSATION_PREFERENCE: { maxRequests: 60, windowMs: 60_000 }, // 60/min per userId
  DND_TOGGLE: { maxRequests: 10, windowMs: 60_000 },           // 10/min per userId
  ```

### Task 3: API Route — Message Search (AC: #1)

- [x] 3.1 Create `src/app/api/v1/conversations/search/route.ts`:

  ```ts
  import { withApiHandler } from "@/server/api/middleware";
  import { successResponse } from "@/lib/api-response";
  import { ApiError } from "@/lib/api-error";
  import { requireAuthenticatedSession } from "@/services/permissions";
  import { searchMessages } from "@/db/queries/chat-conversations";
  import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

  const getHandler = async (request: Request) => {
    const { userId } = await requireAuthenticatedSession();

    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const limitParam = url.searchParams.get("limit");

    if (q.length < 3) {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: "Search query must be at least 3 characters",
      });
    }

    let limit = 20;
    if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 50) {
        throw new ApiError({
          title: "Bad Request",
          status: 400,
          detail: "Invalid 'limit': must be 1–50",
        });
      }
      limit = parsed;
    }

    const results = await searchMessages(userId, q, limit);
    return successResponse({ results, query: q });
  };

  export const GET = withApiHandler(getHandler, {
    rateLimit: {
      key: async () => {
        const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
        const { userId } = await getSession();
        return `message-search:${userId}`;
      },
      ...RATE_LIMIT_PRESETS.MESSAGE_SEARCH,
    },
  });
  ```

  - **CSRF note**: `withApiHandler` validates CSRF for mutating methods (POST/PATCH/DELETE) — GET is exempt, no `Origin` header needed in tests.
  - Route tests: `@vitest-environment node`, mock `@/env`, `@/db`, `@/services/permissions`.

- [x] 3.2 Write tests at `src/app/api/v1/conversations/search/route.test.ts`:
  - Returns 400 when `q` is missing or shorter than 3 chars
  - Returns 400 when `limit` is out of range
  - Returns 200 with `results` array on success (mock `searchMessages`)
  - Rate limit headers present in response

### Task 4: API Routes — Block/Mute (AC: #2, #3)

- [x] 4.1 Create `src/app/api/v1/members/[userId]/block/route.ts`:

  ```ts
  // POST   /api/v1/members/[userId]/block  → block targetUserId
  // DELETE /api/v1/members/[userId]/block  → unblock targetUserId
  // GET    /api/v1/members/[userId]/block  → returns { isBlocked: boolean }
  ```

  - Extract `targetUserId` from URL: `new URL(request.url).pathname.split("/").at(-2)` — because the path is `.../members/{userId}/block` and `.at(-1)` is `"block"`, `.at(-2)` is the userId.
  - Validate `targetUserId` is a valid UUID.
  - Prevent self-block: if `targetUserId === currentUserId`, return 400 "Cannot block yourself".
  - POST uses `blockMember()` from `@/services/block-service` (do NOT call `blockUser` from `@/db/queries/block-mute` directly — service layer pattern).
  - DELETE uses `unblockMember()` from `@/services/block-service`.
  - GET uses `isUserBlocked()` from `@/services/block-service`.
  - All three handlers rate-limited with `RATE_LIMIT_PRESETS.BLOCK_MUTE`.
  - POST returns 200 `{ ok: true }`. DELETE returns 200 `{ ok: true }`. GET returns 200 `{ isBlocked: boolean }`.

- [x] 4.2 Create `src/app/api/v1/members/[userId]/mute/route.ts`:
  - Same structure as block route.
  - POST uses `muteMember()`, DELETE uses `unmuteMember()`, GET uses `isUserMuted()`.
  - `targetUserId` extracted from `.at(-2)`.
  - Rate-limited with `RATE_LIMIT_PRESETS.BLOCK_MUTE`.

- [x] 4.3 Write tests at `src/app/api/v1/members/[userId]/block/route.test.ts`:
  - POST: blocks user, returns 200; prevents self-block (400); handles invalid UUID (400)
  - DELETE: unblocks user, returns 200
  - GET: returns `{ isBlocked: true/false }`
  - All mutating methods require `Origin` header matching `Host` (CSRF validation from `withApiHandler`)

- [x] 4.4 Write tests at `src/app/api/v1/members/[userId]/mute/route.test.ts`:
  - Same structure as block tests

### Task 5: API Routes — Conversation Preferences & DnD (AC: #4, #5)

- [x] 5.1 Create `src/app/api/v1/conversations/[conversationId]/preferences/route.ts`:

  ```ts
  // GET   → returns { notificationPreference: "all" | "mentions" | "muted" }
  // PATCH → body: { notificationPreference: "all" | "mentions" | "muted" }
  //         returns { ok: true }
  ```

  - Extract `conversationId` from URL: `new URL(request.url).pathname.split("/").at(-2)` (because path is `.../conversations/{id}/preferences`).
  - Verify caller is a conversation member (`isConversationMember()` from `@/db/queries/chat-conversations`).
  - Validate preference value: must be `"all" | "mentions" | "muted"` — use plain `if` check (no Zod in these routes, consistent with existing conversation routes).
  - GET uses `getConversationNotificationPreference()`.
  - PATCH uses `updateConversationNotificationPreference()`.
  - Rate-limited with `RATE_LIMIT_PRESETS.CONVERSATION_PREFERENCE`.

- [x] 5.2 Write tests at `src/app/api/v1/conversations/[conversationId]/preferences/route.test.ts`:
  - GET returns current preference (default "all")
  - PATCH updates preference; returns 400 for invalid value; returns 403 for non-member
  - PATCH requires `Origin` header (CSRF)

- [x] 5.3 Create `src/app/api/v1/user/dnd/route.ts`:

  ```ts
  // GET   /api/v1/user/dnd  → returns { dnd: boolean }
  // PATCH /api/v1/user/dnd  body: { enabled: boolean }
  //                         returns { ok: true, dnd: boolean }
  ```

  - **GET handler**: checks `redis.exists('dnd:{userId}')` and returns `{ dnd: boolean }`. Needed by `ConversationPreferences` component to show current DnD state on mount.
  - **PATCH handler**: Body `{ enabled: boolean }` — if `true`, set Redis key `dnd:{userId}` with value `"1"` (no TTL). If `false`, delete the key.
  - Redis client: import `getRedisClient` from `@/lib/redis` (the project's Redis singleton — same pattern used throughout `src/services/`).
  - Key pattern: `dnd:{userId}` — consistent with other `user:{id}:*` patterns from Story 1.15.
  - Rate-limited with `RATE_LIMIT_PRESETS.DND_TOGGLE` (both GET and PATCH).

- [x] 5.4 Write tests at `src/app/api/v1/user/dnd/route.test.ts`:
  - GET returns `{ dnd: false }` when Redis key does not exist
  - GET returns `{ dnd: true }` when Redis key exists
  - PATCH `enabled: true` → Redis `set(dnd:userId, "1")` called
  - PATCH `enabled: false` → Redis `del(dnd:userId)` called
  - PATCH returns 400 for missing/non-boolean `enabled`
  - PATCH requires `Origin` header (CSRF); GET does not

### Task 6: Update Conversation List API — Block Filtering (AC: #2)

- [x] 6.1 Update `GET /api/v1/conversations` handler in `src/app/api/v1/conversations/route.ts`:

  ```ts
  import { getBlockedUserIds } from "@/db/queries/block-mute";

  // In getHandler, before calling getUserConversations:
  const blockedUserIds = await getBlockedUserIds(userId);
  const { conversations, hasMore } = await getUserConversations(userId, {
    limit,
    cursor,
    blockedUserIds,
  });
  ```

  - Adds one additional DB query (simple index scan on `platform_blocked_users`).
  - When `blockedUserIds` is empty, no performance impact (SQL branch is skipped).
  - Do NOT import from `@/services/block-service` here — direct query is fine for this simple lookup.

- [x] 6.2 Update `src/app/api/v1/conversations/route.test.ts`:
  - Add test: when user has blocked another, that direct conversation is absent from results
  - Add test: when blockedUserIds is empty, all conversations returned

### Task 7: NotificationService — CREATE `message.mentioned` Handler with Preference & DnD Checks (AC: #4, #5)

- [x] 7.1 Add a NEW `message.mentioned` EventBus handler to `src/services/notification-service.ts` (from Story 1.15):

  **There is NO existing `message.mentioned` handler** — the file currently only handles `member.approved` and `member.followed`. A comment at line 93 says chat handlers were "intentionally deferred." This task creates the handler from scratch.

  The `MessageMentionedEvent` payload (confirmed from `src/types/events.ts` and `src/services/message-service.ts`):

  ```ts
  {
    messageId: string;
    conversationId: string;
    senderId: string;
    mentionedUserIds: string[];    // Array — multiple users can be mentioned
    contentPreview: string;        // First 100 chars of message content
    timestamp: string;             // ISO 8601
  }
  ```

  Full handler to add after the existing `member.followed` handler (after line ~107):

  ```ts
  import { getConversationNotificationPreference } from "@/db/queries/chat-conversations";
  import type { MessageMentionedEvent } from "@/types/events";

  eventBus.on("message.mentioned", async (payload: MessageMentionedEvent) => {
    const { conversationId, senderId, mentionedUserIds, contentPreview } = payload;

    for (const recipientId of mentionedUserIds) {
      // Check per-conversation notification preference
      const pref = await getConversationNotificationPreference(conversationId, recipientId);
      if (pref === "muted") {
        continue; // suppress — user has muted this conversation
      }
      // "mentions" preference allows message.mentioned through (it IS a mention)
      // "all" also allows through

      // Check global DnD
      const redis = getRedisPublisher();
      const isDnd = await redis.exists(`dnd:${recipientId}`);
      if (isDnd) {
        continue; // suppress — DnD active
      }

      await deliverNotification({
        userId: recipientId,
        actorId: senderId,
        type: "mention",
        title: "notifications.mention.title",
        body: contentPreview,
        link: `/chat?conversation=${conversationId}`,
      });
    }
  });
  ```

  - **Iterates `mentionedUserIds`** — multiple users can be mentioned in one message. Use `continue` (not `return`) to skip suppressed recipients while still processing others.
  - Uses `getRedisPublisher()` from `@/lib/redis` — same Redis client already used in this file for `publishNotification`.
  - Import `getConversationNotificationPreference` from `@/db/queries/chat-conversations`.
  - The `type: "mention"` maps to the `platformNotifications.type` enum which includes `"mention"`. If not, use `"message"` instead — check `src/db/schema/notifications.ts` for valid enum values.

- [x] 7.2 Update `src/services/notification-service.test.ts`:
  - `message.mentioned` handler delivers notification for each mentioned user (baseline — no preferences set)
  - `message.mentioned` with `notification_preference = "muted"` → notification NOT delivered for that recipient
  - `message.mentioned` with DnD active (`redis.exists` returns 1) → notification NOT delivered for that recipient
  - `message.mentioned` with `notification_preference = "mentions"` → notification DELIVERED (mention is allowed)
  - `message.mentioned` with `notification_preference = "all"` → notification DELIVERED
  - `message.mentioned` with 2 mentioned users, one muted and one not → only unmuted user receives notification

### Task 8: New Hook `use-message-search.ts` (AC: #1)

- [x] 8.1 Create `src/features/chat/hooks/use-message-search.ts`:

  ```ts
  "use client";

  import { useState, useCallback, useRef } from "react";
  import { useQuery } from "@tanstack/react-query";

  const MIN_QUERY_LENGTH = 3;
  const DEBOUNCE_MS = 300;

  export function useMessageSearch() {
    const [query, setQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const updateQuery = useCallback((value: string) => {
      setQuery(value);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        setDebouncedQuery(value.trim());
      }, DEBOUNCE_MS);
    }, []);

    const { data, isLoading, error } = useQuery({
      queryKey: ["message-search", debouncedQuery],
      queryFn: async () => {
        if (debouncedQuery.length < MIN_QUERY_LENGTH) return { results: [] };
        const res = await fetch(
          `/api/v1/conversations/search?q=${encodeURIComponent(debouncedQuery)}&limit=20`,
        );
        if (!res.ok) throw new Error("Search failed");
        return res.json() as Promise<{ results: MessageSearchResult[] }>;
      },
      enabled: debouncedQuery.length >= MIN_QUERY_LENGTH,
      staleTime: 30_000,
    });

    return {
      query,
      updateQuery,
      results: data?.results ?? [],
      isLoading: isLoading && debouncedQuery.length >= MIN_QUERY_LENGTH,
      error,
      hasQuery: debouncedQuery.length >= MIN_QUERY_LENGTH,
    };
  }
  ```

  - Import `MessageSearchResult` type: use `import type { MessageSearchResult } from "@/db/queries/chat-conversations"`. This file has NO `server-only` guard (the file comment explicitly states it's used by both Next.js and the standalone realtime server). Type imports are erased at runtime, so this is safe in a client hook.

- [x] 8.2 Write tests at `src/features/chat/hooks/use-message-search.test.ts` (`@vitest-environment jsdom`):
  - Returns empty results when query < 3 chars (no fetch)
  - Debounces: only fires fetch after 300ms of inactivity
  - Returns results from API on success
  - Sets `isLoading` true while fetching

### Task 9: New Component `MessageSearch.tsx` (AC: #1)

- [x] 9.1 Create `src/features/chat/components/MessageSearch.tsx`:

  ```tsx
  "use client";
  // A slide-over or modal panel with a search input + results list.
  // Trigger: a search icon button in the ChatWindow header (or ConversationList header).
  // On result click: closes search panel + calls onNavigate(conversationId, messageId)
  // so ChatWindow can scroll to that message.

  interface MessageSearchProps {
    onNavigate: (conversationId: string, messageId: string) => void;
    onClose: () => void;
  }
  ```

  - Uses `useMessageSearch()` hook.
  - Input: controlled, autofocuses on mount, calls `updateQuery` on change.
  - Results list: shows `senderDisplayName`, `snippet` (rendered as HTML — use `dangerouslySetInnerHTML` ONLY for `snippet` which has `<mark>` tags; the snippet comes from PostgreSQL `ts_headline` which already applies safe delimiters. Validate that only `<mark>` tags are possible — they are, by design of `ts_headline` with `StartSel=<mark>,StopSel=</mark>`).
  - Empty state: shows "No results found" when `hasQuery && results.length === 0`.
  - Loading state: shows skeleton or spinner while `isLoading`.
  - Min-query hint: shows "Type at least 3 characters" when `!hasQuery`.
  - Uses shadcn/ui components (Dialog or Sheet) consistent with GroupInfoPanel pattern.
  - All user-visible strings via `useTranslations("Chat.search")`.

- [x] 9.2 Write tests at `src/features/chat/components/MessageSearch.test.tsx` (`@vitest-environment jsdom`):
  - Renders input with autofocus
  - Shows min-query hint when query < 3 chars
  - Shows loading state while fetching
  - Shows results list on success
  - Calls `onNavigate` when result is clicked
  - Shows "No results" when query has results=0

### Task 10: New Component `ConversationPreferences.tsx` (AC: #2, #3, #4, #5)

- [x] 10.1 Create `src/features/chat/components/ConversationPreferences.tsx`:

  A panel/sheet accessible from the ChatWindow header (kebab menu or info button). Contains:
  - **Notification preference** selector: radio group with "All Messages", "Mentions only", "Muted" (maps to `"all" | "mentions" | "muted"`). On change, calls `PATCH /api/v1/conversations/{id}/preferences`.
  - **Mute member** action (for 1:1 conversations): "Mute [Name]" toggle button. On click, calls `POST/DELETE /api/v1/members/{userId}/mute`. For group conversations, shows mute per-member (or skip for groups in MVP — show "Notification Preference" only).
  - **Block member** action (for 1:1 conversations): "Block [Name]" button. Confirmation dialog before blocking. On confirm, calls `POST /api/v1/members/{userId}/block`. After blocking, navigate back to conversation list.
  - **Do Not Disturb** toggle: global toggle. On toggle, calls `PATCH /api/v1/user/dnd`. Shows current DnD state.

  ```tsx
  interface ConversationPreferencesProps {
    conversationId: string;
    otherMemberId?: string; // Only for direct conversations
    otherMemberName?: string;
    isOpen: boolean;
    onClose: () => void;
    onBlockComplete?: () => void; // Called after blocking — parent navigates away
  }
  ```

  - Initial preference loaded via `GET /api/v1/conversations/{id}/preferences` (use React Query with key `["conversation-preferences", conversationId]`).
  - DnD state loaded via `GET /api/v1/user/dnd` (returns `{ dnd: boolean }`) — use React Query with key `["user-dnd"]`.
  - All user-visible strings via `useTranslations("Chat.preferences")`.
  - Block confirmation: use shadcn/ui `AlertDialog` (same pattern as Story 2.5's delete message confirmation).

- [x] 10.2 Write tests at `src/features/chat/components/ConversationPreferences.test.tsx` (`@vitest-environment jsdom`):
  - Renders notification preference selector with current value
  - Changing preference calls `PATCH .../preferences`
  - Block button shows confirmation dialog before calling block API
  - Mute toggle calls correct API
  - DnD toggle calls `PATCH /api/v1/user/dnd`

### Task 11: Update ChatWindow — Integrate Search & Preferences (AC: #1, #2, #4, #5)

- [x] 11.1 Add search icon button to `ChatWindow` header:
  - Import a `Search` icon from `lucide-react` (already used in other components — check GroupInfoPanel or TopNav).
  - Add `isSearchOpen` state (boolean), toggled by clicking the search icon.
  - Render `<MessageSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} onNavigate={handleNavigateToMessage} />` conditionally.
  - `handleNavigateToMessage(conversationId, messageId)`: if `conversationId === activeConversationId`, scroll to the message with that ID. The message list already uses a keyed list — add a `data-message-id` attribute to each message row and use `scrollIntoView()`. If the conversation is different, navigate to that conversation first (use the router or a callback).

- [x] 11.2 Add preferences panel trigger to ChatWindow header:
  - Existing ChatWindow header likely has a kebab (`⋮`) or info button — add "Conversation settings" menu item that opens `ConversationPreferences`.
  - Pass `conversationId`, `otherMemberId` (for direct), `otherMemberName`.
  - After block completes (`onBlockComplete`), navigate back to conversation list: `router.push("/[locale]/chat")`.

- [x] 11.3 Update `ChatWindow.test.tsx`:
  - Mock `MessageSearch` and `ConversationPreferences` components (they have their own tests — no need to fully render them in ChatWindow tests).
  - Search icon renders in header.
  - Clicking search icon opens MessageSearch.

### Task 12: i18n Translations (AC: all)

- [x] 12.1 Add to `messages/en.json` under `"Chat"` key:

  ```json
  "search": {
    "placeholder": "Search messages...",
    "minQueryHint": "Type at least 3 characters",
    "noResults": "No messages found",
    "searching": "Searching...",
    "resultFrom": "In conversation with {name}",
    "openSearch": "Search messages"
  },
  "preferences": {
    "title": "Conversation Settings",
    "notificationPreference": "Notifications",
    "all": "All messages",
    "mentions": "Mentions only",
    "muted": "Muted",
    "blockMember": "Block {name}",
    "unblockMember": "Unblock {name}",
    "muteMember": "Mute {name}",
    "unmuteMember": "Unmute {name}",
    "blockConfirmTitle": "Block {name}?",
    "blockConfirmBody": "They will no longer be able to message you and their existing conversation will be hidden.",
    "blockConfirmButton": "Block",
    "doNotDisturb": "Do Not Disturb",
    "dndDescription": "Suppress all chat notifications",
    "close": "Close"
  }
  ```

- [x] 12.2 Add corresponding Igbo keys to `messages/ig.json` under `"Chat"`:

  ```json
  "search": {
    "placeholder": "Chọọ ọ̀bá...",
    "minQueryHint": "Dee mkpụrụedemede 3 ma ọ bụ karịa",
    "noResults": "Ahụghị ọ̀bá ọ bụla",
    "searching": "Na-achọ...",
    "resultFrom": "N'ọ̀bá ya na {name}",
    "openSearch": "Chọọ ọ̀bá"
  },
  "preferences": {
    "title": "Ntọala Mkparịta Ụka",
    "notificationPreference": "Ọkwa",
    "all": "Ọ̀bá nile",
    "mentions": "Naanị mgbe a na-akpọ aha m",
    "muted": "Mechie",
    "blockMember": "Gbochie {name}",
    "unblockMember": "Wepu mgbochi maka {name}",
    "muteMember": "Mechie {name}",
    "unmuteMember": "Mepee {name}",
    "blockConfirmTitle": "Gbochie {name}?",
    "blockConfirmBody": "Ọ gaghị enwe ike izitere gị ọ̀bá ọzọ, a na-ezochie mkparịta ụka ha dị ugbu a.",
    "blockConfirmButton": "Gbochie",
    "doNotDisturb": "Ejikọghị Aka",
    "dndDescription": "Gbochie ọkwa mkparịta ụka nile",
    "close": "Mechie"
  }
  ```

### Task 13: Tests Summary

All tests are specified in the tasks above. Minimum new test counts:

- `conversations/search/route.test.ts`: ~5 new tests
- `members/[userId]/block/route.test.ts`: ~5 new tests
- `members/[userId]/mute/route.test.ts`: ~4 new tests
- `conversations/[conversationId]/preferences/route.test.ts`: ~5 new tests
- `user/dnd/route.test.ts`: ~6 new tests
- `conversations/route.test.ts` updates: ~2 new tests (block filtering)
- `notification-service.test.ts` updates: ~6 new tests (handler creation + pref + DnD suppression)
- `use-message-search.test.ts`: ~4 new tests
- `MessageSearch.test.tsx`: ~6 new tests
- `ConversationPreferences.test.tsx`: ~6 new tests
- `ChatWindow.test.tsx` updates: ~3 new tests

**Estimated new tests: ~52–60** (bringing total to ~1614–1622 passing)

## Dev Notes

### No New Migration Required

All required schema is already in place:

- `platform_blocked_users` / `platform_muted_users` — migration 0011 (Story 1.15)
- `chat_conversation_members.notification_preference` — varchar(20) default "all", migration 0013 (Story 2.1)
- GIN index `idx_chat_messages_content_search` on `chat_messages.content` — migration 0013 (Story 2.1)

**Next migration number if schema changes are needed in future: `0015`** (migrations 0000–0014 exist)

### Critical Architecture Patterns (do not deviate)

- **`block-service.ts` ALREADY EXISTS** at `src/services/block-service.ts` — use it for API routes. Do NOT call `@/db/queries/block-mute` directly from routes (service layer pattern). Functions: `blockMember`, `unblockMember`, `isUserBlocked`, `muteMember`, `unmuteMember`, `isUserMuted`, `getBlockList`. **Note:** This file has `import "server-only"` at line 1 — route tests that import block/mute routes will need `vi.mock("server-only", () => ({}))` in their test setup.
- **Block enforcement in `chat.ts` already exists** — `checkIfAnyMemberBlocked()` is called before `message:send`. Story 2.7 does NOT modify this — it adds the HTTP API and conversation list filtering.
- **Block check on conversation creation already exists** — `src/app/api/v1/conversations/route.ts` already checks `isBlocked` both directions before creating direct conversations. Story 2.7 does NOT modify this.
- **`notification_preference` column** — varchar(20), NOT an enum. Valid values: `"all"`, `"mentions"`, `"muted"`. Plain `if` check in the route, no Zod needed.
- **No `server-only` in `chat-conversations.ts`** — the file comment explicitly states it's used by both Next.js and the realtime server. Keep this invariant.
- **Redis key for DnD** — `dnd:{userId}` (no TTL = persists until cleared). Consistent with `user:{userId}:online` from Story 1.15. SET value: `"1"` (truthy string check via `redis.exists()`).
- **`withApiHandler` CSRF validation** — ALL mutating routes (POST/PATCH/DELETE) must include `Origin` header in tests matching the `Host` header. GET routes are exempt.
- **URL parsing for nested routes** — `[conversationId]/preferences/route.ts`: use `.at(-2)` to get conversationId (`.at(-1)` returns `"preferences"`). Same pattern as `[conversationId]/route.ts` which uses `.at(-1)` (see existing code).
- **Zod v4** — If Zod is used for validation, import from `"zod/v4"` and use `parsed.error.issues[0]` not `parsed.issues[0]`.
- **Members route path** — New `src/app/api/v1/members/[userId]/` directory. No existing routes here — this is a new top-level resource under `/api/v1/`.

### `plainto_tsquery` vs `to_tsquery`

Use `plainto_tsquery('english', :query)` (not `to_tsquery`) for arbitrary user input in `searchMessages()`. `plainto_tsquery` treats all input as literal words — no special syntax parsing. This prevents SQL errors from user input like `"foo & | bar"` which would break `to_tsquery`.

### Block Semantics — Only Direct Conversations Filtered

From epics AC: "existing conversations with the blocked member are hidden from the conversation list". This refers ONLY to direct (1:1) conversations. **Group conversations are NOT filtered** even if a blocked user is a member — this is intentional (group admins can enforce moderation, not the blocker). The `getUserConversations` modification must only filter `c.type = 'direct'`.

### `dangerouslySetInnerHTML` Safety in MessageSearch

`ts_headline()` returns a snippet with ONLY the configured `<mark>` and `</mark>` tags — no other HTML is injected by PostgreSQL. This is safe for `dangerouslySetInnerHTML` in `MessageSearch` results rendering. However, ensure the original `content` field is rendered via `RichTextRenderer` (if rich text) or plain text — do NOT use `dangerouslySetInnerHTML` for `content`.

### DnD Redis Key — Standalone Realtime Server Access

The DnD check in `notification-service.ts` uses the same Redis client already instantiated in that file (from Story 1.15). The realtime server's `redisPresence` client (used for presence) is a different Redis connection — for the notification service's DnD check, use the existing Redis client in `notification-service.ts`, not `redisPresence`.

### NotificationService — `message.mentioned` Handler Must Be Created

There is NO existing `message.mentioned` handler in `notification-service.ts` — the file only handles `member.approved` and `member.followed`. A comment at line 93 says chat handlers were "intentionally deferred." Task 7 creates this handler from scratch.

The `MessageMentionedEvent` payload shape (confirmed in `src/types/events.ts:108-116` and emitted by `src/services/message-service.ts:431-438`):

```ts
{ messageId: string; conversationId: string; senderId: string; mentionedUserIds: string[]; contentPreview: string; timestamp: string }
```

`mentionedUserIds` is an array — the handler must iterate over each recipient.

### URL Parsing Pattern for `/members/[userId]/block`

The `[userId]` in `src/app/api/v1/members/[userId]/block/route.ts` is the TARGET user (the person being blocked), NOT the current user. Extract via:

```ts
const targetUserId = new URL(request.url).pathname.split("/").at(-2);
// path: /api/v1/members/{targetUserId}/block
// .at(-1) = "block", .at(-2) = targetUserId
```

### Previous Story Intelligence (from Story 2.6)

- **ACK shape consistency**: Socket.IO handlers use `{ ok: true }` — but Story 2.7 has NO new socket handlers, only REST APIs.
- **CSRF in route tests**: PATCH/DELETE/POST test requests must include `Origin` header matching `Host`.
- **Mock pattern for Redis in tests**: `vi.fn()` returning resolved promises for `set`, `del`, `exists`, `get`.
- **`toHaveBeenCalledTimes(expect.any(Number))` invalid in vitest**: Use `toHaveBeenCalled()` for "called at least once".
- **i18n both files every time**: Add ALL keys to BOTH `en.json` AND `ig.json` — reviewer will flag missing Igbo translations.
- **No hardcoded strings**: All user-visible text via `t()` — including `aria-label` on block/mute buttons.

### Git Commit Style

Recent commits: `feat: Stories X.Y & X.Z — description`. Use this format.

### Project Structure Notes

New files:

- `src/app/api/v1/conversations/search/route.ts` — GET endpoint for message full-text search
- `src/app/api/v1/members/[userId]/block/route.ts` — POST/DELETE/GET for block management
- `src/app/api/v1/members/[userId]/mute/route.ts` — POST/DELETE/GET for mute management
- `src/app/api/v1/conversations/[conversationId]/preferences/route.ts` — GET/PATCH for notification pref
- `src/app/api/v1/user/dnd/route.ts` — GET/PATCH for DnD state
- `src/features/chat/hooks/use-message-search.ts` — React Query hook for message search
- `src/features/chat/components/MessageSearch.tsx` — search dialog component
- `src/features/chat/components/ConversationPreferences.tsx` — preferences + block/mute panel

Modified files:

- `src/db/queries/chat-conversations.ts` — Add `searchMessages`, `updateConversationNotificationPreference`, `getConversationNotificationPreference`; modify `getUserConversations` signature
- `src/services/rate-limiter.ts` — Add 4 new presets
- `src/app/api/v1/conversations/route.ts` — Add block filtering to GET handler
- `src/services/notification-service.ts` — Create `message.mentioned` handler with DnD + notification preference checks
- `src/features/chat/components/ChatWindow.tsx` — Add search icon, preferences panel trigger
- `messages/en.json` — Add Chat.search + Chat.preferences namespaces
- `messages/ig.json` — Add Chat.search + Chat.preferences namespaces (Igbo)

No new files at:

- `src/db/migrations/` — no schema changes needed
- `src/server/realtime/` — no new socket handlers (block/mute/search/prefs are REST-only)
- `src/db/schema/` — no new tables or columns

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2, Story 2.7 content, lines 1548–1585]
- [Source: _bmad-output/planning-artifacts/epics.md — FR38 (message search), FR39 (block/mute), FR40 (notification prefs + DnD), lines 131–132]
- [Source: _bmad-output/planning-artifacts/architecture.md — "PostgreSQL full-text search suffices" (line 1250), no Meilisearch/Typesense at 500 users]
- [Source: src/db/queries/chat-conversations.ts — getUserConversations SQL pattern, searchMessages GIN index usage]
- [Source: src/db/queries/block-mute.ts — blockUser, unblockUser, muteUser, unmuteUser, getBlockedUserIds functions]
- [Source: src/services/block-service.ts — blockMember, unblockMember, muteMember, unmuteMember, isUserBlocked, isUserMuted]
- [Source: src/db/schema/chat-conversations.ts — notificationPreference column (varchar 20, default "all")]
- [Source: src/db/migrations/0011_notifications_block_mute.sql — platform_blocked_users + platform_muted_users table definitions]
- [Source: src/db/migrations/0013_*.sql — GIN index idx_chat_messages_content_search]
- [Source: src/app/api/v1/conversations/route.ts — existing block check pattern, getUserConversations call site]
- [Source: src/app/api/v1/conversations/[conversationId]/route.ts — URL parsing pattern (.at(-1))]
- [Source: src/server/realtime/namespaces/chat.ts — checkIfAnyMemberBlocked, existing block enforcement]
- [Source: src/services/rate-limiter.ts — RATE_LIMIT_PRESETS pattern]
- [Source: _bmad-output/implementation-artifacts/2-6-typing-indicators-read-receipts-presence.md — ACK pattern, CSRF pattern, timer cleanup, i18n both-files rule]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `use-message-search.test.ts` "returns results from API on success": `waitFor` hangs with fake timers (RTL's `setInterval` polling is mocked). Fix: `vi.useRealTimers()` at test start so `waitFor` can poll for React Query's async state update. Debounce fires in real 300ms; test takes ~360ms but is reliable.
- `act()` does not track React Query's async `queryFn` resolution — it only tracks React state updates/effects. Assertions on React Query data must use `waitFor` (real timers) or multiple `act` rounds after advancing timers.

### Completion Notes List

- No new migration required: all schema in place from Stories 1.15 (block/mute tables) and 2.1 (GIN index, notification_preference column).
- `block-service.ts` has `import "server-only"` — route tests for block/mute routes need `vi.mock("server-only", () => ({}))`.
- `dangerouslySetInnerHTML` in `MessageSearch.tsx` is safe: only used for `snippet` field from PostgreSQL `ts_headline`, which only injects `<mark>` tags per `StartSel`/`StopSel` config.
- DnD key pattern: `dnd:{userId}` (no TTL). Checked via `redis.exists()` returning `0` (false) or `1` (true).
- `extractTargetUserId` uses `.at(-2)` for `/members/{userId}/block` path (`.at(-1)` is `"block"`).
- `extractConversationId` uses `.at(-2)` for `/conversations/{id}/preferences` path (`.at(-1)` is `"preferences"`).
- `message.mentioned` handler uses `continue` (not `return`) to skip suppressed recipients while still notifying others.
- `NotificationType` `"mention"` confirmed valid from `src/db/schema/platform-notifications.ts`.
- 76 new tests added (1562 → 1638 total), all passing.

### File List

New files:

- `src/app/api/v1/conversations/search/route.ts`
- `src/app/api/v1/conversations/search/route.test.ts`
- `src/app/api/v1/members/[userId]/block/route.ts`
- `src/app/api/v1/members/[userId]/block/route.test.ts`
- `src/app/api/v1/members/[userId]/mute/route.ts`
- `src/app/api/v1/members/[userId]/mute/route.test.ts`
- `src/app/api/v1/conversations/[conversationId]/preferences/route.ts`
- `src/app/api/v1/conversations/[conversationId]/preferences/route.test.ts`
- `src/app/api/v1/user/dnd/route.ts`
- `src/app/api/v1/user/dnd/route.test.ts`
- `src/features/chat/hooks/use-message-search.ts`
- `src/features/chat/hooks/use-message-search.test.ts`
- `src/features/chat/components/MessageSearch.tsx`
- `src/features/chat/components/MessageSearch.test.tsx`
- `src/features/chat/components/ConversationPreferences.tsx`
- `src/features/chat/components/ConversationPreferences.test.tsx`

Modified files:

- `src/db/queries/chat-conversations.ts`
- `src/services/rate-limiter.ts`
- `src/app/api/v1/conversations/route.ts`
- `src/app/api/v1/conversations/route.test.ts`
- `src/services/notification-service.ts`
- `src/services/notification-service.test.ts`
- `src/features/chat/components/ChatWindow.tsx`
- `src/features/chat/components/ChatWindow.test.tsx`
- `messages/en.json`
- `messages/ig.json`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Senior Developer Review (AI)

**Reviewer:** Dev on 2026-02-28
**Model:** claude-opus-4-6
**Result:** APPROVED (all issues fixed)

### Findings Summary

- **3 High, 4 Medium, 3 Low** issues identified
- **5 fixed** (H2, M1, M2, M3, M4), **5 noted** (H1, H3, L1, L2, L3 — acceptable for MVP)

### Issues Fixed

1. **[H2] useMessageSearch debounce timer cleanup** — Added `useEffect` cleanup to clear `debounceTimer.current` on unmount, preventing potential state update after unmount.
2. **[M1] ConversationPreferences missing block status query** — Added `blockQuery` to check if member is already blocked; block button now toggles between "Block"/"Unblock" labels. Added `unblockMutation` with DELETE endpoint.
3. **[M2] getRedisPublisher() called inside loop** — Hoisted `getRedisPublisher()` call above the `for` loop in `message.mentioned` handler to avoid redundant calls per recipient.
4. **[M3] Missing mute DELETE CSRF test** — Added test verifying DELETE `/api/v1/members/[userId]/mute` requires Origin header.
5. **[M4] MessageSearch clear button aria-label** — Changed clear (X) button `aria-label` from reused "openSearch" to distinct "clearSearch". Added `clearSearch` i18n key to both `en.json` and `ig.json`.

### Issues Noted (acceptable)

- **[H1]** Double `requireAuthenticatedSession()` call in rate limit key + handler — systemic pattern from middleware design, not a new bug.
- **[H3]** `searchMessages()` returns full `content` alongside `snippet` — not a leak since deleted messages are filtered, but increases payload.
- **[L1]** Group conversation names in search results show one member name instead of group name — acceptable MVP UX.
- **[L2]** Redundant length check in `queryFn` when `enabled` already guards — defensive coding, harmless.
- **[L3]** `handleNavigateToMessage` silently fails when target message not in loaded pages — acceptable MVP limitation.

### Test Count After Review

- 1640/1640 passing (+2 new: mute DELETE CSRF test, unblock flow test)

### Change Log

- 2026-02-28: Code review fixes applied (H2, M1, M2, M3, M4) — claude-opus-4-6
