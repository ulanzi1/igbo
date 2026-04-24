"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { usePortalSocket } from "@/providers/SocketProvider";

export interface ConversationPreview {
  id: string;
  applicationId: string | null;
  portalContext: {
    jobId: string;
    companyId: string;
    jobTitle: string;
    companyName: string;
  } | null;
  otherMember: {
    id: string;
    displayName: string;
    photoUrl: string | null;
  };
  lastMessage: {
    content: string;
    contentType: string;
    senderId: string;
    createdAt: string;
  } | null;
  updatedAt: string;
  unreadCount: number;
}

interface UseConversationListReturn {
  conversations: ConversationPreview[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  resetConversationUnread: (conversationId: string) => void;
}

export function useConversationList(): UseConversationListReturn {
  const { data: session } = useSession();
  const userId = session?.user?.id as string | undefined;
  const { portalSocket } = usePortalSocket();
  const refetchPendingRef = useRef(false);
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  // Initial load
  useEffect(() => {
    setIsLoading(true);
    fetch("/api/v1/conversations")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`); // F14: check r.ok
        return r.json() as Promise<{
          data: { conversations: ConversationPreview[]; hasMore: boolean };
        }>;
      })
      .then((data) => {
        setConversations(data.data.conversations);
        setHasMore(data.data.hasMore);
        const last = data.data.conversations.at(-1);
        if (last) setCursor(last.updatedAt);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  // Real-time: update last message preview when message:new arrives
  useEffect(() => {
    if (!portalSocket) return;

    const handleMessageNew = (msg: {
      conversationId: string;
      content: string;
      contentType?: string;
      senderId: string;
      createdAt: string;
    }) => {
      setConversations((prev) => {
        const idx = prev.findIndex((conv) => conv.id === msg.conversationId);
        if (idx === -1) {
          // Unknown conversation — schedule a re-fetch outside the updater (P8 fix)
          if (!refetchPendingRef.current) {
            refetchPendingRef.current = true;
            Promise.resolve().then(() => {
              refetchPendingRef.current = false;
              fetch("/api/v1/conversations")
                .then((r) => {
                  if (!r.ok) throw new Error(`HTTP ${r.status}`);
                  return r.json() as Promise<{
                    data: { conversations: ConversationPreview[]; hasMore: boolean };
                  }>;
                })
                .then((data) => {
                  setConversations(data.data.conversations);
                  setHasMore(data.data.hasMore);
                })
                .catch(console.error);
            });
          }
          return prev;
        }

        // Update the conversation and move it to the top (most-recent-first)
        const isFromOther = msg.senderId !== userId;
        const updated = {
          ...prev[idx]!,
          lastMessage: {
            content: msg.content,
            contentType: msg.contentType ?? "text",
            senderId: msg.senderId,
            createdAt: msg.createdAt,
          },
          updatedAt: msg.createdAt,
          // P4: increment unread count for messages from other party
          unreadCount: isFromOther ? prev[idx]!.unreadCount + 1 : prev[idx]!.unreadCount,
        };
        const rest = prev.filter((_, i) => i !== idx);
        return [updated, ...rest];
      });
    };

    portalSocket.on("message:new", handleMessageNew);
    return () => {
      portalSocket.off("message:new", handleMessageNew);
    };
  }, [portalSocket, userId]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading) return;
    setIsLoading(true);
    const url = cursor
      ? `/api/v1/conversations?cursor=${encodeURIComponent(cursor)}`
      : "/api/v1/conversations";
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`); // F14
        return r.json() as Promise<{
          data: { conversations: ConversationPreview[]; hasMore: boolean };
        }>;
      })
      .then((data) => {
        setConversations((prev) => [...prev, ...data.data.conversations]);
        setHasMore(data.data.hasMore);
        const last = data.data.conversations.at(-1);
        if (last) setCursor(last.updatedAt);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [cursor, hasMore, isLoading]);

  // Called when user opens a conversation — zero out the unread count optimistically.
  const resetConversationUnread = useCallback((conversationId: string) => {
    setConversations((prev) =>
      prev.map((conv) => (conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv)),
    );
  }, []);

  return { conversations, isLoading, hasMore, loadMore, resetConversationUnread };
}
