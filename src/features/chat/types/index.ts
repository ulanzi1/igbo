/** Shared chat types used across the chat feature module */

export interface ChatMessage {
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  contentType: "text" | "rich_text" | "system";
  createdAt: string; // ISO 8601
}

/**
 * LocalChatMessage — client-only type for optimistic update tracking.
 * Extends ChatMessage with a tempId and status field for UI state.
 */
export interface LocalChatMessage extends ChatMessage {
  tempId: string;
  status: "sending" | "sent" | "delivered" | "error";
}

export interface GroupMember {
  id: string;
  displayName: string;
  photoUrl: string | null;
}

export interface ChatConversation {
  id: string;
  type: "direct" | "group" | "channel";
  createdAt: string;
  updatedAt: string;
  otherMember: {
    id: string;
    displayName: string;
    photoUrl: string | null;
  };
  /** Populated for `group` type conversations — up to 4 members for display + total count */
  members?: GroupMember[];
  memberCount?: number;
  lastMessage: {
    content: string;
    senderId: string;
    senderDisplayName?: string;
    createdAt: string;
  } | null;
  unreadCount: number;
}

export interface SyncReplayPayload {
  messages: ChatMessage[];
  hasMore: boolean;
}
