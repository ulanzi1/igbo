"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { DeliveryIndicator } from "./DeliveryIndicator";
import type { DeliveryStatus } from "./DeliveryIndicator";
import { RichTextRenderer } from "./RichTextRenderer";
import { AttachmentGrid } from "./AttachmentGrid";
import { ReactionPicker } from "./ReactionPicker";
import { ReactionBadges } from "./ReactionBadges";
import { useReactions } from "@/features/chat/hooks/use-reactions";
import { useLongPress } from "@/features/chat/hooks/use-long-press";
import type { LocalChatMessage, ChatMessage } from "@/features/chat/types";

interface MessageBubbleProps {
  message: LocalChatMessage | ChatMessage;
  isOwnMessage: boolean;
  showAvatar: boolean; // false for consecutive messages from same sender within 5 min
  senderName?: string;
  senderPhotoUrl?: string | null;
  currentUserId?: string;
  /** All messages in the current conversation for parent-lookup in reply context */
  allMessages?: ChatMessage[];
  /** Cached parent messages for reply context — fallback when allMessages lookup fails */
  parentMessageCache?: Map<string, ChatMessage>;
  /** Map of userId → displayName for reply context display */
  memberDisplayNameMap?: Record<string, string>;
  /** ID of message currently being edited inline */
  editingMessageId?: string | null;
  onReply?: (message: ChatMessage) => void;
  onEdit?: (message: ChatMessage) => void;
  onEditSave?: (messageId: string, content: string) => Promise<void>;
  onEditCancel?: () => void;
  onDelete?: (messageId: string) => void;
  onScrollToMessage?: (messageId: string) => void;
  /** Delivery status for own server messages (sent/delivered/read) — undefined for others' messages */
  deliveryStatus?: DeliveryStatus;
}

function formatMessageTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isLocalMessage(msg: LocalChatMessage | ChatMessage): msg is LocalChatMessage {
  return "tempId" in msg;
}

export function MessageBubble({
  message,
  isOwnMessage,
  showAvatar,
  senderName,
  senderPhotoUrl,
  currentUserId = "",
  allMessages,
  parentMessageCache,
  memberDisplayNameMap,
  editingMessageId,
  onReply,
  onEdit,
  onEditSave,
  onEditCancel,
  onDelete,
  onScrollToMessage,
  deliveryStatus,
}: MessageBubbleProps) {
  const t = useTranslations("Chat");
  const tReactions = useTranslations("Chat.reactions");
  const tActions = useTranslations("Chat.actions");
  const tEditMessage = useTranslations("Chat.editMessage");
  const isLocal = isLocalMessage(message);
  const effectiveStatus: DeliveryStatus = isLocal
    ? (message as LocalChatMessage).status
    : (deliveryStatus ?? "delivered");
  const [showPicker, setShowPicker] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isSaving, setIsSaving] = useState(false);

  const { aggregated, toggleReaction } = useReactions({
    messageId: message.messageId,
    conversationId: message.conversationId,
    initialReactions: message.reactions,
    currentUserId,
  });

  const isEditing = editingMessageId === message.messageId;
  const isDeleted = Boolean(message.deletedAt);

  const longPressProps = useLongPress({
    onLongPress: () => {
      if (!isDeleted) setShowActions(true);
    },
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // When entering edit mode, pre-fill textarea with current content
  useEffect(() => {
    if (isEditing && !isSaving) {
      setEditContent(message.content);
    }
  }, [isEditing, message.content]); // eslint-disable-line react-hooks/exhaustive-deps

  // System messages get centered, muted styling — no avatar, no delivery indicator
  if (message.contentType === "system") {
    return (
      <div className="my-2 flex items-center justify-center">
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {message.content}
        </span>
      </div>
    );
  }

  // Deleted message placeholder — preserve slot for thread coherence
  if (isDeleted) {
    return (
      <div
        data-message-id={message.messageId}
        className={cn(
          "flex items-end gap-2",
          isOwnMessage ? "flex-row-reverse" : "flex-row",
          !showAvatar && "mt-0.5",
          showAvatar && "mt-3",
        )}
      >
        {!isOwnMessage && <div className="flex-shrink-0 w-8 h-8" />}
        <div className={cn("flex flex-col", isOwnMessage ? "items-end" : "items-start")}>
          <div className="rounded-2xl px-3 py-2 text-sm italic text-muted-foreground bg-muted/50">
            {t("messages.deletedMessage")}
          </div>
        </div>
      </div>
    );
  }

  // Parent message lookup for reply context (allMessages first, then cache fallback)
  const parentMessage = message.parentMessageId
    ? (allMessages?.find((m) => m.messageId === message.parentMessageId) ??
      parentMessageCache?.get(message.parentMessageId) ??
      null)
    : null;

  const parentSenderName = parentMessage
    ? (memberDisplayNameMap?.[parentMessage.senderId] ?? parentMessage.senderId)
    : null;

  const handleEditSave = async () => {
    if (!onEditSave || isSaving) return;
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === message.content) return;
    setIsSaving(true);
    try {
      await onEditSave(message.messageId, trimmed);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      data-message-id={message.messageId}
      className={cn(
        "group flex items-end gap-2",
        isOwnMessage ? "flex-row-reverse" : "flex-row",
        !showAvatar && "mt-0.5",
        showAvatar && "mt-3",
      )}
    >
      {/* Avatar — only shown for other member's messages when showAvatar=true */}
      {!isOwnMessage && (
        <div className="flex-shrink-0 w-8 h-8">
          {showAvatar ? (
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-muted">
              {senderPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={senderPhotoUrl}
                  alt={senderName ?? ""}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xs font-semibold text-muted-foreground">
                  {senderName?.charAt(0).toUpperCase() ?? "?"}
                </span>
              )}
            </div>
          ) : (
            // Spacer when avatar is collapsed
            <div className="h-8 w-8" />
          )}
        </div>
      )}

      {/* Message content */}
      <div className={cn("relative flex flex-col", isOwnMessage ? "items-end" : "items-start")}>
        {/* Sender name — shown only for non-own messages when avatar is visible */}
        {!isOwnMessage && showAvatar && senderName && (
          <span className="mb-1 text-xs font-medium text-muted-foreground">{senderName}</span>
        )}

        {/* Reply context — quoted parent box */}
        {message.parentMessageId && (
          <button
            type="button"
            onClick={() => message.parentMessageId && onScrollToMessage?.(message.parentMessageId)}
            className={cn(
              "mb-1 max-w-xs rounded-md border-l-2 border-primary bg-muted/60 px-2 py-1 text-left text-xs",
              "hover:bg-muted transition-colors",
            )}
          >
            {parentMessage && parentSenderName && (
              <span className="block font-semibold text-primary">{parentSenderName}</span>
            )}
            <span className="block text-muted-foreground line-clamp-1">
              {parentMessage
                ? parentMessage.deletedAt
                  ? t("reply.deletedParent")
                  : parentMessage.content.slice(0, 80) +
                    (parentMessage.content.length > 80 ? "…" : "")
                : t("reply.originalMessage")}
            </span>
          </button>
        )}

        {/* Bubble + reaction picker container */}
        <div className="relative" {...longPressProps}>
          {/* Message bubble or inline edit */}
          {isEditing ? (
            <div className="max-w-xs lg:max-w-md flex flex-col gap-1">
              <textarea
                ref={textareaRef}
                autoFocus
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                disabled={isSaving}
                maxLength={4000}
                rows={2}
                className="resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary min-w-[200px]"
              />
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs text-muted-foreground">
                  {tEditMessage("characterCount", { count: editContent.length })}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={onEditCancel}
                    disabled={isSaving}
                    className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {tEditMessage("cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleEditSave()}
                    disabled={
                      isSaving ||
                      editContent.trim() === message.content ||
                      editContent.trim().length === 0 ||
                      editContent.trim().length > 4000
                    }
                    className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? "…" : tEditMessage("save")}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "max-w-xs rounded-2xl px-3 py-2 text-sm lg:max-w-md",
                isOwnMessage
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-muted text-foreground rounded-bl-sm",
              )}
            >
              {message.content &&
                (message.contentType === "rich_text" ? (
                  <RichTextRenderer content={message.content} className="break-words" />
                ) : (
                  <p className="break-words whitespace-pre-wrap">{message.content}</p>
                ))}
              {(message.attachments ?? []).length > 0 && (
                <AttachmentGrid attachments={message.attachments ?? []} />
              )}
            </div>
          )}

          {/* Action buttons — desktop hover (own messages: reply+edit+delete, others: reply) */}
          {!isEditing && (
            <div
              className={cn(
                "absolute top-1 hidden md:flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100",
                isOwnMessage ? "-left-24" : "-right-24",
              )}
            >
              <button
                type="button"
                onClick={() => onReply?.(message as ChatMessage)}
                aria-label={tActions("reply")}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground hover:bg-accent"
              >
                ↩
              </button>
              {isOwnMessage && (
                <>
                  <button
                    type="button"
                    onClick={() => onEdit?.(message as ChatMessage)}
                    aria-label={tActions("edit")}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground hover:bg-accent"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete?.(message.messageId)}
                    aria-label={tActions("delete")}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground hover:bg-accent"
                  >
                    🗑
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setShowPicker((v) => !v)}
                aria-label={tReactions("react")}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground hover:bg-accent"
              >
                😊
              </button>
            </div>
          )}

          {/* Mobile action sheet (long-press) */}
          {showActions && !isEditing && (
            <>
              {/* Backdrop for click-away dismiss */}
              <div
                className="fixed inset-0 z-[9]"
                onClick={() => setShowActions(false)}
                aria-hidden="true"
              />
              <div
                className={cn(
                  "absolute bottom-full mb-1 z-10 flex flex-col gap-1 rounded-lg bg-background border border-border p-2 shadow-lg min-w-[120px]",
                  isOwnMessage ? "right-0" : "left-0",
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowActions(false);
                    onReply?.(message as ChatMessage);
                  }}
                  className="text-left px-2 py-1 rounded text-sm hover:bg-muted"
                >
                  {tActions("reply")}
                </button>
                {isOwnMessage && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setShowActions(false);
                        onEdit?.(message as ChatMessage);
                      }}
                      className="text-left px-2 py-1 rounded text-sm hover:bg-muted"
                    >
                      {tActions("edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowActions(false);
                        onDelete?.(message.messageId);
                      }}
                      className="text-left px-2 py-1 rounded text-sm text-destructive hover:bg-destructive/10"
                    >
                      {tActions("delete")}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowActions(false);
                    setShowPicker(true);
                  }}
                  className="text-left px-2 py-1 rounded text-sm hover:bg-muted"
                >
                  {tReactions("react")}
                </button>
                <button
                  type="button"
                  onClick={() => setShowActions(false)}
                  className="text-left px-2 py-1 rounded text-sm text-muted-foreground hover:bg-muted"
                >
                  {tActions("cancel")}
                </button>
              </div>
            </>
          )}

          {/* Reaction picker popover */}
          {showPicker && (
            <ReactionPicker
              onSelect={(emoji) => void toggleReaction(emoji)}
              onClose={() => setShowPicker(false)}
            />
          )}
        </div>

        {/* Reaction badges */}
        {aggregated.length > 0 && (
          <ReactionBadges reactions={aggregated} onToggle={(emoji) => void toggleReaction(emoji)} />
        )}

        {/* Timestamp + delivery indicator + edited label */}
        <div className="mt-0.5 flex items-center gap-1">
          <span className="text-xs text-muted-foreground">
            {formatMessageTime(message.createdAt)}
          </span>
          {message.editedAt && !message.deletedAt && (
            <span className="text-xs text-muted-foreground">{t("messages.editedLabel")}</span>
          )}
          {isOwnMessage && !message.deletedAt && <DeliveryIndicator status={effectiveStatus} />}
        </div>
      </div>
    </div>
  );
}
