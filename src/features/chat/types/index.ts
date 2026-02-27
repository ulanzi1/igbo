/** Shared chat types used across the chat feature module */

export interface ChatMessage {
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  contentType: "text" | "rich_text" | "system";
  createdAt: string; // ISO 8601
}

export interface ChatConversation {
  id: string;
  type: "direct" | "group" | "channel";
  createdAt: string;
  updatedAt: string;
}

export interface SyncReplayPayload {
  messages: ChatMessage[];
  hasMore: boolean;
}
