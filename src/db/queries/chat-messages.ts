import "server-only";
import { eq, and, lt, gt, desc, asc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages } from "@/db/schema/chat-messages";
import { chatConversations } from "@/db/schema/chat-conversations";

export type { ChatMessage, NewChatMessage, MessageContentType } from "@/db/schema/chat-messages";
import type { ChatMessage, NewChatMessage } from "@/db/schema/chat-messages";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

// ── Message CRUD ───────────────────────────────────────────────────────────────

/**
 * Create a new message and update the conversation's updated_at in one transaction.
 * The updated_at on chat_conversations drives conversation list ordering by recency.
 */
export async function createMessage(data: NewChatMessage): Promise<ChatMessage> {
  return db.transaction(async (tx) => {
    const [message] = await tx.insert(chatMessages).values(data).returning();
    if (!message) throw new Error("Insert returned no message");

    // Update conversation updated_at for recency ordering (Story 2.2 list)
    await tx
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
  options: { cursor?: string; limit?: number; direction?: "before" | "after" } = {},
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
    isNull(chatMessages.deletedAt),
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
  return db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.conversationId, conversationId),
        gt(chatMessages.createdAt, since),
        isNull(chatMessages.deletedAt),
      ),
    )
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
