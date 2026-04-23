// NOTE: No "server-only" — used by both Next.js and the standalone realtime server
import { eq, and, lt, gt, gte, desc, asc, isNull } from "drizzle-orm";
import { db } from "../index";
import { chatMessages } from "../schema/chat-messages";
import { chatConversations } from "../schema/chat-conversations";

export type { ChatMessage, NewChatMessage, MessageContentType } from "../schema/chat-messages";
import type { ChatMessage, NewChatMessage } from "../schema/chat-messages";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

// ── Message CRUD ───────────────────────────────────────────────────────────────

/**
 * Create a new message and update the conversation's updated_at in one transaction.
 * The updated_at on chat_conversations drives conversation list ordering by recency.
 *
 * @param tx - Optional outer transaction. When provided, operations run within it (for atomic
 *             first-message creation in ConversationService). When omitted, wraps in own
 *             transaction (backward compatible).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createMessage(data: NewChatMessage, tx?: any): Promise<ChatMessage> {
  if (tx) {
    // Called within an outer transaction — use provided tx directly
    const [message] = await tx.insert(chatMessages).values(data).returning();
    if (!message) throw new Error("Insert returned no message");
    await tx
      .update(chatConversations)
      .set({ updatedAt: new Date() })
      .where(eq(chatConversations.id, data.conversationId));
    return message;
  }
  // No outer tx — wrap in own transaction (backward compatible)
  return db.transaction(async (innerTx) => {
    const [message] = await innerTx.insert(chatMessages).values(data).returning();
    if (!message) throw new Error("Insert returned no message");

    // Update conversation updated_at for recency ordering (Story 2.2 list)
    await innerTx
      .update(chatConversations)
      .set({ updatedAt: new Date() })
      .where(eq(chatConversations.id, data.conversationId));

    return message;
  });
}

/**
 * Get a single message by ID (not soft-deleted).
 */
export async function getMessageById(messageId: string): Promise<ChatMessage | null> {
  const [row] = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.id, messageId), isNull(chatMessages.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Get a single message by ID regardless of soft-delete status.
 * Used by MessageService to check ownership and deleted state before update/delete.
 */
export async function getMessageByIdUnfiltered(messageId: string): Promise<ChatMessage | null> {
  const [row] = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId)).limit(1);
  return row ?? null;
}

/**
 * Update message content and set edited_at timestamp.
 * Returns the updated row.
 */
export async function updateMessageContent(
  messageId: string,
  content: string,
): Promise<ChatMessage | null> {
  const [row] = await db
    .update(chatMessages)
    .set({ content, editedAt: new Date() })
    .where(eq(chatMessages.id, messageId))
    .returning();
  return row ?? null;
}

/**
 * Get all non-deleted replies to a parent message, ordered chronologically.
 */
export async function getThreadReplies(parentMessageId: string): Promise<ChatMessage[]> {
  return db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.parentMessageId, parentMessageId), isNull(chatMessages.deletedAt)))
    .orderBy(asc(chatMessages.createdAt));
}

/**
 * Cursor-based pagination for conversation messages.
 *
 * @param conversationId - The conversation to load messages for
 * @param options.cursor - Message ID to paginate from (omit for latest)
 * @param options.limit - Number of messages (default 50, max 100)
 * @param options.direction - 'before' (older) or 'after' (newer)
 * @returns messages in chronological order (oldest first in response)
 */
export async function getConversationMessages(
  conversationId: string,
  options: {
    cursor?: string;
    limit?: number;
    direction?: "before" | "after";
    /** Filter to messages at/after this date — enforces AC4 join visibility for group members */
    joinedAfter?: Date;
  } = {},
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const direction = options.direction ?? "before";

  // Resolve cursor to created_at timestamp for efficient index use
  let cursorDate: Date | undefined;
  if (options.cursor) {
    const [cursorRow] = await db
      .select({ createdAt: chatMessages.createdAt })
      .from(chatMessages)
      .where(eq(chatMessages.id, options.cursor))
      .limit(1);
    cursorDate = cursorRow?.createdAt;
  }

  const baseConditions = [
    eq(chatMessages.conversationId, conversationId),
    // Note: deleted messages are intentionally included (soft-delete) so thread coherence is preserved.
    // The service layer blanks content for deleted messages before sending to clients.
    // Enforce join-point visibility for group members (AC4 of Story 2.3)
    ...(options.joinedAfter ? [gte(chatMessages.createdAt, options.joinedAfter)] : []),
  ];

  // Add cursor condition based on direction
  const conditions = cursorDate
    ? [
        ...baseConditions,
        direction === "before"
          ? lt(chatMessages.createdAt, cursorDate)
          : gt(chatMessages.createdAt, cursorDate),
      ]
    : baseConditions;

  // Fetch limit + 1 to determine hasMore
  const rows = await db
    .select()
    .from(chatMessages)
    .where(and(...conditions))
    .orderBy(direction === "before" ? desc(chatMessages.createdAt) : asc(chatMessages.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const messages = rows.slice(0, limit);

  // Always return in chronological order (oldest first)
  if (direction === "before") {
    messages.reverse();
  }

  return { messages, hasMore };
}

/**
 * Get messages since a given timestamp — used for reconnection gap sync.
 * Returns at most `limit` messages ordered oldest first.
 */
export async function getMessagesSince(
  conversationId: string,
  since: Date,
  limit = MAX_PAGE_SIZE,
): Promise<ChatMessage[]> {
  // Note: deleted messages are intentionally included (same as getConversationMessages)
  // so sync:replay can deliver deletion info. The caller blanks content for deleted messages.
  return db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.conversationId, conversationId), gt(chatMessages.createdAt, since)))
    .orderBy(asc(chatMessages.createdAt))
    .limit(limit);
}

/**
 * Soft-delete a message.
 */
export async function softDeleteMessage(messageId: string, userId: string): Promise<boolean> {
  const result = await db
    .update(chatMessages)
    .set({ deletedAt: new Date() })
    .where(and(eq(chatMessages.id, messageId), eq(chatMessages.senderId, userId)))
    .returning({ id: chatMessages.id });
  return result.length > 0;
}
