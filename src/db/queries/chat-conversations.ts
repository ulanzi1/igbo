import "server-only";
import { eq, and, isNull, desc, lt } from "drizzle-orm";
import { db } from "@/db";
import { chatConversations, chatConversationMembers } from "@/db/schema/chat-conversations";

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

/**
 * List all active conversations for a given user (via membership).
 * Returns most-recently updated conversations first.
 * Cursor-based: pass `cursor` (ISO 8601 updatedAt of last item) to load next page.
 */
export async function getUserConversations(
  userId: string,
  options: { limit?: number; cursor?: string } = {},
): Promise<{ conversations: ChatConversation[]; hasMore: boolean }> {
  const limit = Math.min(options.limit ?? 20, 50);

  const conditions = [isNull(chatConversations.deletedAt)];

  // Cursor = updatedAt of last item from previous page (ordered DESC, so next page is "less than")
  if (options.cursor) {
    const cursorDate = new Date(options.cursor);
    if (!isNaN(cursorDate.getTime())) {
      conditions.push(lt(chatConversations.updatedAt, cursorDate));
    }
  }

  const rows = await db
    .select({
      id: chatConversations.id,
      type: chatConversations.type,
      createdAt: chatConversations.createdAt,
      updatedAt: chatConversations.updatedAt,
      deletedAt: chatConversations.deletedAt,
    })
    .from(chatConversations)
    .innerJoin(
      chatConversationMembers,
      and(
        eq(chatConversationMembers.conversationId, chatConversations.id),
        eq(chatConversationMembers.userId, userId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(chatConversations.updatedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const conversations = rows.slice(0, limit);

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
