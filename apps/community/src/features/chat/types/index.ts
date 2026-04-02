/** Shared chat types used across the chat feature module */

/** JSON payload stored in content when contentType === "shared_post" */
export interface SharedPostPayload {
  postId: string;
  postUrl: string;
  authorName: string;
  authorPhotoUrl: string | null;
  text: string; // original post text content (may be empty for media-only posts)
  postContentType: string; // "text" | "rich_text" | "media" | "announcement"
  media: Array<{
    mediaUrl: string;
    mediaType: string; // "image" | "video" | "audio"
    altText: string | null;
  }>;
}

export interface ChatMessageAttachment {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string | null;
  fileSize: number | null; // bytes
}

export interface ChatMessageReaction {
  emoji: string;
  userId: string;
  createdAt: string; // ISO 8601
}

export interface ChatMessage {
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  contentType: "text" | "rich_text" | "system" | "shared_post";
  createdAt: string; // ISO 8601
  attachments: ChatMessageAttachment[];
  reactions: ChatMessageReaction[];
  /** Present when this message is a reply to another message */
  parentMessageId?: string | null;
  /** ISO 8601 — set when message has been edited */
  editedAt?: string | null;
  /** ISO 8601 — set when message has been soft-deleted; content will be "" */
  deletedAt?: string | null;
}

/**
 * LocalChatMessage — client-only type for optimistic update tracking.
 * Extends ChatMessage with a tempId and status field for UI state.
 */
export interface LocalChatMessage extends ChatMessage {
  tempId: string;
  status: "sending" | "sent" | "delivered" | "read" | "error";
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
    contentType: string;
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
