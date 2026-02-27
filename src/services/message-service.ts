import "server-only";
import { eventBus } from "@/services/event-bus";
import { createMessage, getMessageById, getConversationMessages } from "@/db/queries/chat-messages";
import type { ChatMessage, MessageContentType } from "@/db/schema/chat-messages";

// ── Interface ──────────────────────────────────────────────────────────────────

export interface SendMessageParams {
  conversationId: string;
  senderId: string;
  content: string;
  contentType?: MessageContentType;
  parentMessageId?: string;
}

export interface GetMessagesParams {
  cursor?: string;
  limit?: number;
  direction?: "before" | "after";
}

export interface GetMessagesResult {
  messages: ChatMessage[];
  hasMore: boolean;
}

/**
 * MessageService interface — all chat read/write operations go through here.
 * Phase 1: PlaintextMessageService stores/retrieves plaintext in PostgreSQL.
 * Phase 2 (future): EncryptedMessageService swaps in E2E encryption (NFR-S12)
 * without changing calling code.
 */
export interface MessageService {
  sendMessage(params: SendMessageParams): Promise<ChatMessage>;
  getMessages(conversationId: string, params?: GetMessagesParams): Promise<GetMessagesResult>;
  getMessage(messageId: string): Promise<ChatMessage | null>;
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
    eventBus.emit("message.sent", {
      messageId: message.id,
      senderId: message.senderId,
      conversationId: message.conversationId,
      content: message.content,
      contentType: message.contentType,
      createdAt: message.createdAt.toISOString(),
      timestamp: message.createdAt.toISOString(),
    });

    return message;
  }

  async getMessages(
    conversationId: string,
    params: GetMessagesParams = {},
  ): Promise<GetMessagesResult> {
    return getConversationMessages(conversationId, params);
  }

  async getMessage(messageId: string): Promise<ChatMessage | null> {
    return getMessageById(messageId);
  }
}

// ── Singleton export ───────────────────────────────────────────────────────────

export const messageService: MessageService = new PlaintextMessageService();
