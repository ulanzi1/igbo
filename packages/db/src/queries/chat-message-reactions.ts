// NOTE: No "server-only" — used by both Next.js and the standalone realtime server
import { eq, inArray, and } from "drizzle-orm";
import { db } from "../index";
import { chatMessageReactions } from "../schema/chat-message-reactions";

export type { ChatMessageReaction, NewChatMessageReaction } from "../schema/chat-message-reactions";
import type { ChatMessageReaction } from "../schema/chat-message-reactions";

// ── Reaction CRUD ───────────────────────────────────────────────────────────────

/**
 * Add a reaction. Silently no-ops on duplicate (composite PK handles uniqueness at DB level).
 * Returns the created reaction or null if it already existed.
 */
export async function addReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<ChatMessageReaction | null> {
  const rows = await db
    .insert(chatMessageReactions)
    .values({ messageId, userId, emoji })
    .onConflictDoNothing()
    .returning();
  return rows[0] ?? null;
}

/**
 * Remove a reaction. Returns true if a row was deleted.
 */
export async function removeReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<boolean> {
  const result = await db
    .delete(chatMessageReactions)
    .where(
      and(
        eq(chatMessageReactions.messageId, messageId),
        eq(chatMessageReactions.userId, userId),
        eq(chatMessageReactions.emoji, emoji),
      ),
    )
    .returning({ messageId: chatMessageReactions.messageId });
  return result.length > 0;
}

/**
 * Get all reactions for a single message.
 */
export async function getReactionsForMessage(messageId: string): Promise<ChatMessageReaction[]> {
  return db
    .select()
    .from(chatMessageReactions)
    .where(eq(chatMessageReactions.messageId, messageId));
}

/**
 * Batch-load reactions for a set of message IDs. Avoids N+1 queries.
 */
export async function getReactionsForMessages(
  messageIds: string[],
): Promise<ChatMessageReaction[]> {
  if (messageIds.length === 0) return [];
  return db
    .select()
    .from(chatMessageReactions)
    .where(inArray(chatMessageReactions.messageId, messageIds));
}
