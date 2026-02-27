"use client";

import { cn } from "@/lib/utils";
import { DeliveryIndicator } from "./DeliveryIndicator";
import type { LocalChatMessage, ChatMessage } from "@/features/chat/types";

interface MessageBubbleProps {
  message: LocalChatMessage | ChatMessage;
  isOwnMessage: boolean;
  showAvatar: boolean; // false for consecutive messages from same sender within 5 min
  senderName?: string;
  senderPhotoUrl?: string | null;
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
}: MessageBubbleProps) {
  const isLocal = isLocalMessage(message);
  const status = isLocal ? message.status : "delivered";

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

  return (
    <div
      className={cn(
        "flex items-end gap-2",
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
      <div className={cn("flex flex-col", isOwnMessage ? "items-end" : "items-start")}>
        {/* Sender name — shown only for non-own messages when avatar is visible */}
        {!isOwnMessage && showAvatar && senderName && (
          <span className="mb-1 text-xs font-medium text-muted-foreground">{senderName}</span>
        )}

        {/* Message bubble */}
        <div
          className={cn(
            "max-w-xs rounded-2xl px-3 py-2 text-sm lg:max-w-md",
            isOwnMessage
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-muted text-foreground rounded-bl-sm",
          )}
        >
          <p className="break-words whitespace-pre-wrap">{message.content}</p>
        </div>

        {/* Timestamp + delivery indicator */}
        <div className="mt-0.5 flex items-center gap-1">
          <span className="text-xs text-muted-foreground">
            {formatMessageTime(message.createdAt)}
          </span>
          {isOwnMessage && <DeliveryIndicator status={status} />}
        </div>
      </div>
    </div>
  );
}
