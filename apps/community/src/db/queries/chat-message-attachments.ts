// NOTE: No "server-only" — used by both Next.js and the standalone realtime server
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { chatMessageAttachments } from "@/db/schema/chat-message-attachments";

export type {
  ChatMessageAttachment,
  NewChatMessageAttachment,
} from "@/db/schema/chat-message-attachments";
import type {
  ChatMessageAttachment,
  NewChatMessageAttachment,
} from "@/db/schema/chat-message-attachments";

// ── Attachment CRUD ─────────────────────────────────────────────────────────────

/**
 * Create one or more attachments for a message.
 * Accepts a transaction `tx` for use inside `db.transaction()`.
 */
export async function createMessageAttachments(
  messageId: string,
  attachments: Omit<NewChatMessageAttachment, "messageId">[],
  tx?: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<ChatMessageAttachment[]> {
  if (attachments.length === 0) return [];
  const client = tx ?? db;
  const values = attachments.map((a) => ({ ...a, messageId }));
  const rows = await client.insert(chatMessageAttachments).values(values).returning();
  return rows;
}

/**
 * Get all attachments for a single message.
 */
export async function getMessageAttachments(messageId: string): Promise<ChatMessageAttachment[]> {
  return db
    .select()
    .from(chatMessageAttachments)
    .where(eq(chatMessageAttachments.messageId, messageId));
}

/**
 * Batch-load attachments for a set of message IDs. Avoids N+1 queries.
 * Returns all attachments across all given message IDs.
 */
export async function getAttachmentsForMessages(
  messageIds: string[],
): Promise<ChatMessageAttachment[]> {
  if (messageIds.length === 0) return [];
  return db
    .select()
    .from(chatMessageAttachments)
    .where(inArray(chatMessageAttachments.messageId, messageIds));
}
