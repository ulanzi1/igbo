"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { usePortalMessages } from "@/hooks/use-portal-messages";
import { useTypingIndicator } from "@/hooks/use-typing-indicator";
import { usePortalSocket } from "@/providers/SocketProvider";
import { MessageBubble } from "./MessageBubble";
import { DateSeparator } from "./DateSeparator";
import { MessageInput } from "./MessageInput";
import { TypingIndicator } from "./TypingIndicator";

interface ConversationThreadProps {
  applicationId: string;
  /** The conversationId for socket event filtering */
  conversationId?: string;
  /** Supplied by parent from /api/v1/conversations/[applicationId]/status */
  readOnly?: boolean;
  /** The other participant's display name (for bubble labels) */
  otherParticipantName?: string;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function ConversationThread({
  applicationId,
  conversationId,
  readOnly = false,
  otherParticipantName,
}: ConversationThreadProps) {
  const t = useTranslations("Portal.messages");
  const { data: session } = useSession();
  const userId = session?.user?.id as string | undefined;
  const { portalSocket, isConnected, connectionPhase } = usePortalSocket(); // F8

  const { messages, isLoading, hasMore, loadOlder, sendMessage, retryMessage } = usePortalMessages({
    applicationId,
    conversationId,
  });

  const { typingUserId, emitTypingStart, emitTypingStop } = useTypingIndicator({
    conversationId,
    userId,
  });

  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isSending, setIsSending] = useState(false);
  // Track other-party message count to emit message:read only when new messages arrive from them
  const otherMsgCountRef = useRef(0);
  const [showNewIndicator, setShowNewIndicator] = useState(false);
  const isAtBottomRef = useRef(true);
  // F16: Scroll preservation refs
  const prevScrollHeightRef = useRef(0);
  const prevScrollTopRef = useRef(0);
  const prevMessageCountRef = useRef(0);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 64;
    if (isAtBottomRef.current) setShowNewIndicator(false);
  }, []);

  // F16: Capture scroll state before prepend for position preservation
  useEffect(() => {
    const el = listRef.current;
    if (el) {
      prevScrollHeightRef.current = el.scrollHeight;
      prevScrollTopRef.current = el.scrollTop;
    }
    prevMessageCountRef.current = messages.length;
  });

  // F16: useLayoutEffect for scroll adjustment after older messages are prepended
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // Detect prepend (message count grew but not from append)
    if (
      messages.length > prevMessageCountRef.current &&
      prevScrollHeightRef.current > 0 &&
      !isAtBottomRef.current
    ) {
      const heightDiff = el.scrollHeight - prevScrollHeightRef.current;
      if (heightDiff > 0) {
        el.scrollTop = prevScrollTopRef.current + heightDiff;
      }
    }
  }, [messages.length]);

  // Auto-scroll to bottom on new messages if at bottom
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      setShowNewIndicator(false);
    } else if (messages.length > 0) {
      setShowNewIndicator(true);
    }
  }, [messages.length]);

  // IntersectionObserver for scroll-up pagination
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadOlder();
        }
      },
      { root: listRef.current, threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadOlder]);

  const handleSend = useCallback(
    async (content: string) => {
      emitTypingStop(); // Clear typing indicator immediately on send
      setIsSending(true);
      try {
        await sendMessage(content);
      } finally {
        setIsSending(false);
      }
    },
    [sendMessage, emitTypingStop],
  );

  // F7: Wire retry to failed messages
  const handleRetry = useCallback(
    (optimisticId: string) => {
      void retryMessage(optimisticId);
    },
    [retryMessage],
  );

  // Emit message:read when new messages from the other participant become visible
  useEffect(() => {
    if (!portalSocket || !conversationId || !userId) return;
    const otherCount = messages.filter((m) => m.senderId !== userId && !m._optimisticId).length;
    if (otherCount > otherMsgCountRef.current) {
      portalSocket.emit("message:read", { conversationId });
    }
    otherMsgCountRef.current = otherCount;
  }, [portalSocket, conversationId, messages, userId]);

  const scrollToBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setShowNewIndicator(false);
    isAtBottomRef.current = true;
  };

  // Render messages with date separators
  const rendered: React.ReactNode[] = [];
  let lastDate: Date | null = null;

  for (const msg of messages) {
    const msgDate = new Date(msg.createdAt);
    if (!lastDate || !isSameDay(lastDate, msgDate)) {
      rendered.push(<DateSeparator key={`sep-${msg.id}-${msg.createdAt}`} date={msgDate} />);
      lastDate = msgDate;
    }
    rendered.push(
      <MessageBubble
        key={msg._optimisticId ?? msg.id}
        message={msg}
        isSelf={userId ? msg.senderId === userId : false}
        senderName={otherParticipantName}
        onRetry={msg._status === "failed" ? handleRetry : undefined}
      />,
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* F8: Connection status banner */}
      {!isConnected && connectionPhase === "reconnecting" && (
        <div
          role="status"
          className="px-4 py-2 text-xs text-center text-warning-foreground bg-warning/20 border-b border-border"
        >
          {t("reconnecting")}
        </div>
      )}
      {!isConnected && connectionPhase === "lost" && (
        <div
          role="alert"
          className="px-4 py-2 text-xs text-center text-destructive bg-destructive/10 border-b border-border"
        >
          {t("connectionLost")}
        </div>
      )}

      {/* Message list */}
      <div
        ref={listRef}
        role="log"
        aria-label={t("threadAriaLabel")}
        aria-live="polite"
        aria-busy={isLoading} // F12
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5"
      >
        {/* Pagination sentinel at top */}
        <div ref={sentinelRef} />

        {isLoading && messages.length === 0 && (
          <div className="flex flex-col gap-3 p-4" aria-label={t("loading")}>
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-10 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="flex items-center justify-center h-full py-12">
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          </div>
        )}

        {rendered}
      </div>

      {/* "New message" scroll indicator */}
      {showNewIndicator && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-full shadow"
        >
          {t("newMessageIndicator")}
        </button>
      )}

      {/* Typing indicator — shown above input when other participant is typing */}
      {!readOnly && typingUserId && <TypingIndicator typingName={otherParticipantName} />}

      {/* Read-only banner or message input */}
      {readOnly ? (
        <div
          role="status"
          className="px-4 py-3 text-sm text-center text-muted-foreground border-t border-border bg-muted/50"
        >
          {t("readOnlyBanner")}
        </div>
      ) : (
        <MessageInput
          onSend={handleSend}
          isSending={isSending}
          onTyping={emitTypingStart}
          onTypingStop={emitTypingStop}
        />
      )}
    </div>
  );
}
