// NOTE: No "server-only" — used by both Next.js and the standalone realtime server
import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { chatConversations, chatConversationMembers } from "@/db/schema/chat-conversations";
import { communityProfiles } from "@/db/schema/community-profiles";

export type {
  ChatConversation,
  NewChatConversation,
  ChatConversationMember,
  NewChatConversationMember,
  ConversationType,
  ConversationMemberRole,
} from "@/db/schema/chat-conversations";
import type {
  ChatConversation,
  ChatConversationMember,
  ConversationType,
} from "@/db/schema/chat-conversations";

// ── Conversation CRUD ──────────────────────────────────────────────────────────

/**
 * Create a new conversation and add all participants as members.
 * Uses a transaction so the conversation and members are created atomically.
 */
export async function createConversation(
  type: ConversationType,
  memberUserIds: string[],
): Promise<ChatConversation> {
  return db.transaction(async (tx) => {
    const [conversation] = await tx.insert(chatConversations).values({ type }).returning();
    if (!conversation) throw new Error("Insert returned no conversation");

    if (memberUserIds.length > 0) {
      await tx.insert(chatConversationMembers).values(
        memberUserIds.map((userId) => ({
          conversationId: conversation.id,
          userId,
        })),
      );
    }

    return conversation;
  });
}

/**
 * Get a single conversation by ID (not soft-deleted).
 */
export async function getConversationById(
  conversationId: string,
): Promise<ChatConversation | null> {
  const [row] = await db
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.id, conversationId), isNull(chatConversations.deletedAt)))
    .limit(1);
  return row ?? null;
}

export type EnrichedGroupMember = {
  id: string;
  displayName: string;
  photoUrl: string | null;
};

export type EnrichedUserConversation = {
  id: string;
  type: "direct" | "group" | "channel";
  createdAt: Date;
  updatedAt: Date;
  otherMember: {
    id: string;
    displayName: string;
    photoUrl: string | null;
  };
  /** Populated for `group` type conversations — up to 4 members for display + total count */
  members?: EnrichedGroupMember[];
  memberCount?: number;
  lastMessage: {
    content: string;
    contentType: string;
    senderId: string;
    senderDisplayName?: string;
    createdAt: Date;
  } | null;
  unreadCount: number;
};

/**
 * List all active conversations for a given user with enriched data:
 * other member's profile, last message preview, and unread count.
 * Returns most-recently updated conversations first.
 * Cursor-based: pass `cursor` (ISO 8601 updatedAt of last item) to load next page.
 */
export async function getUserConversations(
  userId: string,
  options: { limit?: number; cursor?: string; blockedUserIds?: string[] } = {},
): Promise<{ conversations: EnrichedUserConversation[]; hasMore: boolean }> {
  const limit = Math.min(options.limit ?? 20, 50);
  const cursorDate = options.cursor ? new Date(options.cursor) : null;

  const rows = await db.execute(sql`
    SELECT
      c.id::text,
      c.type::text,
      c.created_at,
      c.updated_at,
      COALESCE(ccm_other.user_id::text, '') as other_member_id,
      COALESCE(cp.display_name, 'Unknown') as other_member_display_name,
      cp.photo_url as other_member_photo_url,
      lm.content as last_message_content,
      lm.sender_id::text as last_message_sender_id,
      lm.sender_display_name as last_message_sender_display_name,
      lm.created_at as last_message_created_at,
      lm.content_type::text as last_message_content_type,
      COALESCE((
        SELECT COUNT(*)::int
        FROM chat_messages um
        WHERE um.conversation_id = c.id
          AND um.deleted_at IS NULL
          AND (ccm_me.last_read_at IS NULL OR um.created_at > ccm_me.last_read_at)
      ), 0) as unread_count,
      -- Group members: JSON array of up to 4 member profiles (excluding self)
      CASE WHEN c.type = 'group' THEN (
        SELECT json_agg(gm_data)
        FROM (
          SELECT gm.user_id::text as id,
                 COALESCE(gcp.display_name, 'Unknown') as "displayName",
                 gcp.photo_url as "photoUrl"
          FROM chat_conversation_members gm
          LEFT JOIN community_profiles gcp
            ON gcp.user_id = gm.user_id AND gcp.deleted_at IS NULL
          WHERE gm.conversation_id = c.id AND gm.user_id != ${userId}::uuid
          LIMIT 4
        ) gm_data
      ) ELSE NULL END as group_members,
      -- Total member count for group conversations
      CASE WHEN c.type = 'group' THEN (
        SELECT COUNT(*)::int
        FROM chat_conversation_members cnt
        WHERE cnt.conversation_id = c.id
      ) ELSE NULL END as member_count
    FROM chat_conversations c
    INNER JOIN chat_conversation_members ccm_me
      ON ccm_me.conversation_id = c.id AND ccm_me.user_id = ${userId}::uuid
    LEFT JOIN LATERAL (
      SELECT user_id FROM chat_conversation_members
      WHERE conversation_id = c.id AND user_id != ${userId}::uuid
      LIMIT 1
    ) ccm_other ON true
    LEFT JOIN community_profiles cp
      ON cp.user_id = ccm_other.user_id AND cp.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT cm.content, cm.sender_id, cp2.display_name as sender_display_name, cm.created_at, cm.content_type
      FROM chat_messages cm
      LEFT JOIN community_profiles cp2
        ON cp2.user_id = cm.sender_id AND cp2.deleted_at IS NULL
      WHERE cm.conversation_id = c.id AND cm.deleted_at IS NULL
      ORDER BY cm.created_at DESC
      LIMIT 1
    ) lm ON true
    WHERE c.deleted_at IS NULL
    ${cursorDate ? sql`AND c.updated_at < ${cursorDate}` : sql``}
    ${
      (options.blockedUserIds ?? []).length > 0
        ? sql`AND NOT (c.type = 'direct' AND ccm_other.user_id::text = ANY(ARRAY[${sql.join(
            (options.blockedUserIds ?? []).map((id) => sql`${id}`),
            sql`, `,
          )}]::text[]))`
        : sql``
    }
    ORDER BY c.updated_at DESC
    LIMIT ${limit + 1}
  `);

  const hasMore = rows.length > limit;
  const rawRows = rows.slice(0, limit) as Array<{
    id: string;
    type: string;
    created_at: Date;
    updated_at: Date;
    other_member_id: string;
    other_member_display_name: string;
    other_member_photo_url: string | null;
    last_message_content: string | null;
    last_message_content_type: string | null;
    last_message_sender_id: string | null;
    last_message_sender_display_name: string | null;
    last_message_created_at: Date | null;
    unread_count: number;
    group_members: Array<{ id: string; displayName: string; photoUrl: string | null }> | null;
    member_count: number | null;
  }>;

  const conversations: EnrichedUserConversation[] = rawRows.map((row) => ({
    id: row.id,
    type: row.type as "direct" | "group" | "channel",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    otherMember: {
      id: row.other_member_id,
      displayName: row.other_member_display_name,
      photoUrl: row.other_member_photo_url,
    },
    ...(row.type === "group" && {
      members: row.group_members ?? [],
      memberCount: Number(row.member_count ?? 0),
    }),
    lastMessage:
      row.last_message_content && row.last_message_sender_id && row.last_message_created_at
        ? {
            content: row.last_message_content.slice(0, 100), // truncate to 100 chars
            contentType: row.last_message_content_type ?? "text",
            senderId: row.last_message_sender_id,
            ...(row.last_message_sender_display_name && {
              senderDisplayName: row.last_message_sender_display_name,
            }),
            createdAt: row.last_message_created_at,
          }
        : null,
    unreadCount: Number(row.unread_count),
  }));

  return { conversations, hasMore };
}

// ── Membership queries ─────────────────────────────────────────────────────────

/**
 * Get all conversation IDs a user is a member of (for auto-join on socket connect).
 */
export async function getUserConversationIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ conversationId: chatConversationMembers.conversationId })
    .from(chatConversationMembers)
    .innerJoin(
      chatConversations,
      and(
        eq(chatConversations.id, chatConversationMembers.conversationId),
        isNull(chatConversations.deletedAt),
      ),
    )
    .where(eq(chatConversationMembers.userId, userId));
  return rows.map((r) => r.conversationId);
}

/**
 * Check if a user is a member of a conversation.
 */
export async function isConversationMember(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ conversationId: chatConversationMembers.conversationId })
    .from(chatConversationMembers)
    .where(
      and(
        eq(chatConversationMembers.conversationId, conversationId),
        eq(chatConversationMembers.userId, userId),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Get all members of a conversation.
 */
export async function getConversationMembers(
  conversationId: string,
): Promise<ChatConversationMember[]> {
  return db
    .select()
    .from(chatConversationMembers)
    .where(eq(chatConversationMembers.conversationId, conversationId));
}

/**
 * Soft-delete a conversation.
 */
export async function softDeleteConversation(conversationId: string): Promise<void> {
  await db
    .update(chatConversations)
    .set({ deletedAt: new Date() })
    .where(eq(chatConversations.id, conversationId));
}

/**
 * Find an existing direct conversation between two users.
 * Returns the conversation ID if found, null otherwise.
 */
export async function findExistingDirectConversation(
  userIdA: string,
  userIdB: string,
): Promise<string | null> {
  // A direct conversation between two users: both are members, type = direct
  const rows = await db.execute(sql`
    SELECT c.id
    FROM chat_conversations c
    INNER JOIN chat_conversation_members ccm_a
      ON ccm_a.conversation_id = c.id AND ccm_a.user_id = ${userIdA}::uuid
    INNER JOIN chat_conversation_members ccm_b
      ON ccm_b.conversation_id = c.id AND ccm_b.user_id = ${userIdB}::uuid
    WHERE c.type = 'direct' AND c.deleted_at IS NULL
    LIMIT 1
  `);
  const row = rows[0] as { id: string } | undefined;
  return row?.id ?? null;
}

/**
 * Mark a conversation as read for a user by updating last_read_at.
 */
export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  await db
    .update(chatConversationMembers)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(chatConversationMembers.conversationId, conversationId),
        eq(chatConversationMembers.userId, userId),
      ),
    );
}

// ── Group member management ────────────────────────────────────────────────────

export type ConversationWithMembers = {
  conversation: ChatConversation;
  members: Array<{
    id: string;
    displayName: string;
    photoUrl: string | null;
    lastReadAt: Date | null;
  }>;
  memberCount: number;
};

/**
 * Add a member to a conversation.
 * Sets joined_at = NOW() and last_read_at = NOW() so the new member only sees
 * messages sent after they joined (enforces AC 4 of Story 2.3).
 */
export async function addConversationMember(conversationId: string, userId: string): Promise<void> {
  const now = new Date();
  await db.execute(sql`
    INSERT INTO chat_conversation_members (conversation_id, user_id, joined_at, last_read_at, role)
    VALUES (${conversationId}::uuid, ${userId}::uuid, ${now}, ${now}, 'member')
  `);
}

/**
 * Remove a member from a conversation.
 */
export async function removeConversationMember(
  conversationId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(chatConversationMembers)
    .where(
      and(
        eq(chatConversationMembers.conversationId, conversationId),
        eq(chatConversationMembers.userId, userId),
      ),
    );
}

/**
 * Get the total number of members in a conversation.
 */
export async function getConversationMemberCount(conversationId: string): Promise<number> {
  const rows = await db.execute(sql`
    SELECT COUNT(*)::int as count
    FROM chat_conversation_members
    WHERE conversation_id = ${conversationId}::uuid
  `);
  const row = rows[0] as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

/**
 * Get conversation details plus all member profiles.
 * Used by GroupInfoPanel to display the full participant list.
 */
export async function getConversationWithMembers(
  conversationId: string,
): Promise<ConversationWithMembers | null> {
  const conversation = await getConversationById(conversationId);
  if (!conversation) return null;

  const rows = await db.execute(sql`
    SELECT
      ccm.user_id::text as id,
      COALESCE(cp.display_name, 'Unknown') as "displayName",
      cp.photo_url as "photoUrl",
      ccm.last_read_at as "lastReadAt",
      cub.badge_type as "badgeType"
    FROM chat_conversation_members ccm
    LEFT JOIN community_profiles cp
      ON cp.user_id = ccm.user_id AND cp.deleted_at IS NULL
    LEFT JOIN community_user_badges cub
      ON cub.user_id = ccm.user_id
    WHERE ccm.conversation_id = ${conversationId}::uuid
    ORDER BY ccm.joined_at ASC
  `);

  const members = rows as unknown as Array<{
    id: string;
    displayName: string;
    photoUrl: string | null;
    lastReadAt: Date | null;
    badgeType: "blue" | "red" | "purple" | null;
  }>;

  return { conversation, members, memberCount: members.length };
}

/**
 * Check if adding a new user to a group would violate any block relationships.
 * Checks BOTH directions: new user blocked by any existing member, or existing member blocked by new user.
 * Returns true if a block conflict exists (action should be rejected).
 */
export async function checkGroupBlockConflict(
  newUserId: string,
  existingMemberIds: string[],
): Promise<boolean> {
  if (existingMemberIds.length === 0) return false;

  const rows = await db.execute(sql`
    SELECT 1
    FROM platform_blocked_users
    WHERE (blocker_user_id = ${newUserId}::uuid AND blocked_user_id = ANY(${`{${existingMemberIds.join(",")}}`}::uuid[]))
       OR (blocker_user_id = ANY(${`{${existingMemberIds.join(",")}}`}::uuid[]) AND blocked_user_id = ${newUserId}::uuid)
    LIMIT 1
  `);
  return rows.length > 0;
}

/**
 * Get the joined_at timestamp for a specific member in a conversation.
 * Used to enforce AC 4: new members only see messages from their join point forward.
 */
export async function getMemberJoinedAt(
  conversationId: string,
  userId: string,
): Promise<Date | null> {
  const rows = await db.execute(sql`
    SELECT joined_at
    FROM chat_conversation_members
    WHERE conversation_id = ${conversationId}::uuid AND user_id = ${userId}::uuid
    LIMIT 1
  `);
  const row = rows[0] as { joined_at: string | Date } | undefined;
  if (!row?.joined_at) return null;
  return row.joined_at instanceof Date ? row.joined_at : new Date(row.joined_at);
}

/**
 * Check if ANY block relationships exist among a set of user IDs.
 * Used during group creation to ensure no member has blocked another.
 * Single SQL query checks all pairs in both directions.
 */
export async function checkBlocksAmongMembers(memberIds: string[]): Promise<boolean> {
  if (memberIds.length < 2) return false;
  const rows = await db.execute(sql`
    SELECT 1
    FROM platform_blocked_users
    WHERE blocker_user_id = ANY(${`{${memberIds.join(",")}}`}::uuid[])
      AND blocked_user_id = ANY(${`{${memberIds.join(",")}}`}::uuid[])
    LIMIT 1
  `);
  return rows.length > 0;
}

// ── Message search ────────────────────────────────────────────────────────────

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

/**
 * Full-text search across messages visible to userId.
 * Uses the GIN index idx_chat_messages_content_search (migration 0013).
 * Uses plainto_tsquery so arbitrary user input is safe (no special syntax).
 */
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

// ── Notification preference ────────────────────────────────────────────────────

export type NotificationPreference = "all" | "mentions" | "muted";

/**
 * Update a conversation member's per-conversation notification preference.
 */
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

/**
 * Read a conversation member's current per-conversation notification preference.
 * Returns "all" if the member row is not found.
 */
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

// Suppress unused import warning — communityProfiles is referenced in SQL template literals
void communityProfiles;
