// NOTE: No "server-only" — used by both Next.js and the standalone realtime server
import { and, count, eq } from "drizzle-orm";
import { eventBus } from "@/services/event-bus";
import {
  createMessage,
  getMessageById,
  getMessageByIdUnfiltered,
  updateMessageContent,
  getConversationMessages,
  getThreadReplies as dbGetThreadReplies,
} from "@/db/queries/chat-messages";
import { getAttachmentsForMessages } from "@/db/queries/chat-message-attachments";
import {
  addReaction as dbAddReaction,
  removeReaction as dbRemoveReaction,
} from "@/db/queries/chat-message-reactions";
import { getFileUploadById } from "@/db/queries/file-uploads";
import { db } from "@/db";
import { chatMessages } from "@/db/schema/chat-messages";
import { chatConversations, chatConversationMembers } from "@/db/schema/chat-conversations";
import { chatMessageAttachments } from "@/db/schema/chat-message-attachments";
import { authUsers } from "@/db/schema/auth-users";
import type { ChatMessage, MessageContentType } from "@/db/schema/chat-messages";
import type { ChatMessageAttachment } from "@/db/schema/chat-message-attachments";

// ── Interface ──────────────────────────────────────────────────────────────────

export interface SendMessageParams {
  conversationId: string;
  senderId: string;
  content: string;
  contentType?: MessageContentType;
  parentMessageId?: string;
}

export interface SendMessageWithAttachmentsParams extends SendMessageParams {
  attachmentFileUploadIds: string[];
}

export interface GetMessagesParams {
  cursor?: string;
  limit?: number;
  direction?: "before" | "after";
  /** For group conversations: filter to messages on/after this date (enforces AC4 join visibility) */
  joinedAfter?: Date;
}

export interface GetMessagesResult {
  messages: ChatMessage[];
  hasMore: boolean;
}

export interface ReactionResult {
  messageId: string;
  userId: string;
  emoji: string;
}

/**
 * MessageService interface — all chat read/write operations go through here.
 * Phase 1: PlaintextMessageService stores/retrieves plaintext in PostgreSQL.
 * Phase 2 (future): EncryptedMessageService swaps in E2E encryption (NFR-S12)
 * without changing calling code.
 */
export interface MessageService {
  sendMessage(params: SendMessageParams): Promise<ChatMessage>;
  /**
   * Send a message with file attachments.
   * Validates file uploads (must be ready + owned by sender), creates message + attachments
   * in a single transaction, and emits message.sent with attachments in the payload.
   * Separate from sendMessage() to preserve backwards-compatible signature for existing callers.
   */
  sendMessageWithAttachments(params: SendMessageWithAttachmentsParams): Promise<ChatMessage>;
  /**
   * Send a system message (member added/left notifications).
   * Uses content_type: "system" to distinguish from user messages.
   * actingUserId is the real user who triggered the action — NOT a fake system UUID
   * (sender_id has NOT NULL FK constraint to auth_users.id).
   */
  sendSystemMessage(
    conversationId: string,
    actingUserId: string,
    content: string,
  ): Promise<ChatMessage>;
  getMessages(conversationId: string, params?: GetMessagesParams): Promise<GetMessagesResult>;
  getMessage(messageId: string): Promise<ChatMessage | null>;
  /**
   * Edit a message's content. Emits message.edited EventBus event.
   * Throws 404 if not found, 403 if not owner, 410 if already deleted.
   */
  updateMessage(messageId: string, userId: string, content: string): Promise<ChatMessage>;
  /**
   * Soft-delete a message. Emits message.deleted EventBus event.
   * Throws 404 if not found, 403 if not owner, 410 if already deleted.
   */
  deleteMessage(messageId: string, userId: string): Promise<void>;
  /**
   * Get all non-deleted replies to a parent message, ordered chronologically.
   * Includes attachments and reactions.
   */
  getThreadReplies(parentMessageId: string): Promise<ChatMessage[]>;
  addReaction(
    messageId: string,
    userId: string,
    emoji: string,
    conversationId: string,
  ): Promise<ReactionResult | null>;
  removeReaction(
    messageId: string,
    userId: string,
    emoji: string,
    conversationId: string,
  ): Promise<boolean>;
}

// ── PlaintextMessageService ────────────────────────────────────────────────────

/**
 * Phase 1 implementation — stores plaintext in PostgreSQL via Drizzle queries.
 * Emits `message.sent` EventBus event after persisting so the EventBus bridge
 * can route the message to the conversation Socket.IO room.
 */
class PlaintextMessageService implements MessageService {
  async sendMessage(params: SendMessageParams): Promise<ChatMessage> {
    const { conversationId, senderId, content, contentType = "text", parentMessageId } = params;

    const message = await createMessage({
      conversationId,
      senderId,
      content,
      contentType,
      parentMessageId: parentMessageId ?? null,
    });

    // Emit from service (never from routes or namespace handlers)
    // Note: use ?? null (not ?? undefined) — undefined is dropped by JSON.stringify
    // which would lose parentMessageId when passing through Redis pub/sub.

    // Story 9.2: Gather extra fields for first-DM email notification.
    // Only fetch conversation details for direct messages to avoid unnecessary DB queries.
    const [conversationRow] = await db
      .select({ type: chatConversations.type })
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId))
      .limit(1);
    const conversationType = conversationRow?.type ?? "direct";

    let recipientId: string | undefined;
    let senderName: string | undefined;
    let messageCount: number | undefined;

    if (conversationType === "direct") {
      const members = await db
        .select({
          userId: chatConversationMembers.userId,
          name: authUsers.name,
        })
        .from(chatConversationMembers)
        .innerJoin(authUsers, eq(authUsers.id, chatConversationMembers.userId))
        .where(eq(chatConversationMembers.conversationId, conversationId));

      recipientId = members.find((m) => m.userId !== senderId)?.userId;
      senderName = members.find((m) => m.userId === senderId)?.name ?? undefined;

      const [countRow] = await db
        .select({ count: count() })
        .from(chatMessages)
        .where(and(eq(chatMessages.conversationId, conversationId)));
      messageCount = Number(countRow?.count ?? 1);
    }

    eventBus.emit("message.sent", {
      messageId: message.id,
      senderId: message.senderId,
      conversationId: message.conversationId,
      content: message.content,
      contentType: message.contentType,
      createdAt: message.createdAt.toISOString(),
      parentMessageId: message.parentMessageId ?? null,
      timestamp: message.createdAt.toISOString(),
      conversationType,
      recipientId,
      messagePreview: content.slice(0, 100),
      messageCount,
      senderName,
    });

    // Detect and emit mentions
    this._emitMentions(message.id, conversationId, senderId, content);

    return message;
  }

  async sendMessageWithAttachments(params: SendMessageWithAttachmentsParams): Promise<ChatMessage> {
    const {
      conversationId,
      senderId,
      content,
      contentType = "text",
      parentMessageId,
      attachmentFileUploadIds,
    } = params;

    if (attachmentFileUploadIds.length > 10) {
      throw new Error("Cannot attach more than 10 files per message");
    }

    // Validate all file uploads: must exist, be ready, and belong to sender
    const uploads = await Promise.all(attachmentFileUploadIds.map((id) => getFileUploadById(id)));

    for (let i = 0; i < uploads.length; i++) {
      const upload = uploads[i];
      const id = attachmentFileUploadIds[i];
      if (!upload) {
        throw new Error(`File upload not found: ${id}`);
      }
      if (upload.status !== "ready") {
        throw new Error(`File upload is not ready: ${id} (status: ${upload.status})`);
      }
      if (upload.uploaderId !== senderId) {
        throw new Error(`File upload does not belong to sender: ${id}`);
      }
    }

    const validUploads = uploads as NonNullable<(typeof uploads)[number]>[];

    // Create message and attachments in a single transaction (inline — avoids nested transaction complexity)
    const { message, createdAttachments } = await db.transaction(async (tx) => {
      const [msg] = await tx
        .insert(chatMessages)
        .values({
          conversationId,
          senderId,
          content,
          contentType,
          parentMessageId: parentMessageId ?? null,
        })
        .returning();
      if (!msg) throw new Error("Insert returned no message");

      // Update conversation updated_at for recency ordering
      await tx
        .update(chatConversations)
        .set({ updatedAt: new Date() })
        .where(eq(chatConversations.id, conversationId));

      // Insert attachments with denormalized fields for fast reads
      const attValues = validUploads.map((upload) => ({
        messageId: msg.id,
        fileUploadId: upload.id,
        fileUrl: upload.processedUrl ?? "",
        fileName: upload.originalFilename ?? upload.objectKey,
        fileType: upload.fileType ?? null,
        fileSize: upload.fileSize ?? null,
      }));

      const atts = await tx.insert(chatMessageAttachments).values(attValues).returning();

      return { message: msg, createdAttachments: atts };
    });

    const attachmentPayload = createdAttachments.map((a) => ({
      id: a.id,
      fileUrl: a.fileUrl,
      fileName: a.fileName,
      fileType: a.fileType ?? null,
      fileSize: a.fileSize ?? null,
    }));

    // Story 9.2: Gather extra fields for first-DM email notification (same as sendMessage).
    const [convRow] = await db
      .select({ type: chatConversations.type })
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId))
      .limit(1);
    const convType = convRow?.type ?? "direct";

    let recipientId: string | undefined;
    let senderName: string | undefined;
    let msgCount: number | undefined;

    if (convType === "direct") {
      const members = await db
        .select({
          userId: chatConversationMembers.userId,
          name: authUsers.name,
        })
        .from(chatConversationMembers)
        .innerJoin(authUsers, eq(authUsers.id, chatConversationMembers.userId))
        .where(eq(chatConversationMembers.conversationId, conversationId));

      recipientId = members.find((m) => m.userId !== senderId)?.userId;
      senderName = members.find((m) => m.userId === senderId)?.name ?? undefined;

      const [countRow] = await db
        .select({ count: count() })
        .from(chatMessages)
        .where(and(eq(chatMessages.conversationId, conversationId)));
      msgCount = Number(countRow?.count ?? 1);
    }

    // Emit with attachments so bridge can include them in message:new without a DB query
    // Note: use ?? null (not ?? undefined) — undefined is dropped by JSON.stringify
    eventBus.emit("message.sent", {
      messageId: message.id,
      senderId: message.senderId,
      conversationId: message.conversationId,
      content: message.content,
      contentType: message.contentType,
      createdAt: message.createdAt.toISOString(),
      parentMessageId: message.parentMessageId ?? null,
      timestamp: message.createdAt.toISOString(),
      attachments: attachmentPayload,
      conversationType: convType,
      recipientId,
      messagePreview: content.slice(0, 100),
      messageCount: msgCount,
      senderName,
    });

    // Detect and emit mentions
    this._emitMentions(message.id, conversationId, senderId, content);

    return message;
  }

  async sendSystemMessage(
    conversationId: string,
    actingUserId: string,
    content: string,
  ): Promise<ChatMessage> {
    const message = await createMessage({
      conversationId,
      senderId: actingUserId,
      content,
      contentType: "system",
      parentMessageId: null,
    });

    // Emit so the EventBus bridge broadcasts to the conversation room
    // conversationType: "group" prevents first-DM handler from firing (F4 review fix)
    eventBus.emit("message.sent", {
      messageId: message.id,
      senderId: message.senderId,
      conversationId: message.conversationId,
      content: message.content,
      contentType: message.contentType,
      createdAt: message.createdAt.toISOString(),
      timestamp: message.createdAt.toISOString(),
      conversationType: "group",
    });

    return message;
  }

  async getMessages(
    conversationId: string,
    params: GetMessagesParams = {},
  ): Promise<GetMessagesResult> {
    const result = await getConversationMessages(conversationId, params);
    if (result.messages.length === 0) {
      return { messages: result.messages, hasMore: result.hasMore };
    }

    // Batch-load attachments for this page — avoids N+1
    const messageIds = result.messages.map((m) => m.id);
    const attachments = await getAttachmentsForMessages(messageIds);

    // Group attachments by messageId for efficient lookup
    const attachmentsByMessageId = new Map<string, ChatMessageAttachment[]>();
    for (const att of attachments) {
      const list = attachmentsByMessageId.get(att.messageId) ?? [];
      list.push(att);
      attachmentsByMessageId.set(att.messageId, list);
    }

    // Tag messages with their attachments (reactions are loaded by REST API separately)
    // Data privacy: blank content for soft-deleted messages — client checks deletedAt to render placeholder
    const messagesWithAttachments = result.messages.map((m) => ({
      ...m,
      content: m.deletedAt !== null ? "" : m.content,
      _attachments: attachmentsByMessageId.get(m.id) ?? [],
    }));

    return {
      messages: messagesWithAttachments as unknown as ChatMessage[],
      hasMore: result.hasMore,
    };
  }

  async getMessage(messageId: string): Promise<ChatMessage | null> {
    return getMessageById(messageId);
  }

  async updateMessage(messageId: string, userId: string, content: string): Promise<ChatMessage> {
    const message = await getMessageByIdUnfiltered(messageId);
    if (!message) {
      const err = new Error("Message not found");
      (err as NodeJS.ErrnoException).code = "NOT_FOUND";
      throw err;
    }
    if (message.senderId !== userId) {
      const err = new Error("Cannot edit another member's message");
      (err as NodeJS.ErrnoException).code = "FORBIDDEN";
      throw err;
    }
    if (message.deletedAt !== null) {
      const err = new Error("Message has been deleted");
      (err as NodeJS.ErrnoException).code = "GONE";
      throw err;
    }

    const updated = await updateMessageContent(messageId, content);
    if (!updated) throw new Error("Update returned no row");

    eventBus.emit("message.edited", {
      messageId,
      conversationId: message.conversationId,
      senderId: userId,
      content,
      editedAt: updated.editedAt!.toISOString(),
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const message = await getMessageByIdUnfiltered(messageId);
    if (!message) {
      const err = new Error("Message not found");
      (err as NodeJS.ErrnoException).code = "NOT_FOUND";
      throw err;
    }
    if (message.senderId !== userId) {
      const err = new Error("Cannot delete another member's message");
      (err as NodeJS.ErrnoException).code = "FORBIDDEN";
      throw err;
    }
    if (message.deletedAt !== null) {
      const err = new Error("Message has already been deleted");
      (err as NodeJS.ErrnoException).code = "GONE";
      throw err;
    }

    await db
      .update(chatMessages)
      .set({ deletedAt: new Date() })
      .where(eq(chatMessages.id, messageId));

    eventBus.emit("message.deleted", {
      messageId,
      conversationId: message.conversationId,
      senderId: userId,
      timestamp: new Date().toISOString(),
    });
  }

  async getThreadReplies(parentMessageId: string): Promise<ChatMessage[]> {
    const replies = await dbGetThreadReplies(parentMessageId);
    if (replies.length === 0) return replies;

    const messageIds = replies.map((m) => m.id);
    const [attachments, reactions] = await Promise.all([
      getAttachmentsForMessages(messageIds),
      import("@/db/queries/chat-message-reactions").then((m) =>
        m.getReactionsForMessages(messageIds),
      ),
    ]);

    const attachmentsByMsgId = new Map<string, ChatMessageAttachment[]>();
    for (const a of attachments) {
      const list = attachmentsByMsgId.get(a.messageId) ?? [];
      list.push(a);
      attachmentsByMsgId.set(a.messageId, list);
    }

    const reactionsByMsgId = new Map<string, typeof reactions>();
    for (const r of reactions) {
      const list = reactionsByMsgId.get(r.messageId) ?? [];
      list.push(r);
      reactionsByMsgId.set(r.messageId, list);
    }

    return replies.map((m) => ({
      ...m,
      _attachments: attachmentsByMsgId.get(m.id) ?? [],
      _reactions: reactionsByMsgId.get(m.id) ?? [],
    })) as unknown as ChatMessage[];
  }

  /** Extract mention tokens from content and emit message.mentioned EventBus event. */
  private _emitMentions(
    messageId: string,
    conversationId: string,
    senderId: string,
    content: string,
  ): void {
    const mentionRegex = /@\[([^\]]+)\]\(mention:([^)]+)\)/g;
    const userIds = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(content)) !== null) {
      const userId = match[2];
      if (userId && userId !== senderId) {
        userIds.add(userId);
      }
    }
    if (userIds.size === 0) return;

    eventBus.emit("message.mentioned", {
      messageId,
      conversationId,
      senderId,
      mentionedUserIds: Array.from(userIds),
      contentPreview: content.slice(0, 100),
      timestamp: new Date().toISOString(),
    });
  }

  async addReaction(
    messageId: string,
    userId: string,
    emoji: string,
    conversationId: string,
  ): Promise<ReactionResult | null> {
    const result = await dbAddReaction(messageId, userId, emoji);
    if (!result) return null; // Already existed

    eventBus.emit("reaction.added", {
      messageId,
      conversationId,
      userId,
      emoji,
      timestamp: new Date().toISOString(),
    });

    return { messageId, userId, emoji };
  }

  async removeReaction(
    messageId: string,
    userId: string,
    emoji: string,
    conversationId: string,
  ): Promise<boolean> {
    const deleted = await dbRemoveReaction(messageId, userId, emoji);
    if (!deleted) return false;

    eventBus.emit("reaction.removed", {
      messageId,
      conversationId,
      userId,
      emoji,
      timestamp: new Date().toISOString(),
    });

    return true;
  }
}

// ── Singleton export ───────────────────────────────────────────────────────────

export const messageService: MessageService = new PlaintextMessageService();
