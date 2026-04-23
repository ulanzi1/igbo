"use client";

import { useState, useEffect, useCallback } from "react";
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
}

interface UseConversationListReturn {
  conversations: ConversationPreview[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => void;
}

export function useConversationList(): UseConversationListReturn {
  const { portalSocket } = usePortalSocket();
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
          // F9: Unknown conversation (first-message flow) — re-fetch list to pick it up.
          // We could optimistically insert a stub, but we lack full ConversationPreview data
          // from just a message:new event. Refetch is safer.
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
          return prev;
        }

        // F6: Update the conversation and move it to the top (most-recent-first)
        const updated = {
          ...prev[idx]!,
          lastMessage: {
            content: msg.content,
            contentType: msg.contentType ?? "text",
            senderId: msg.senderId,
            createdAt: msg.createdAt,
          },
          updatedAt: msg.createdAt,
        };
        const rest = prev.filter((_, i) => i !== idx);
        return [updated, ...rest];
      });
    };

    portalSocket.on("message:new", handleMessageNew);
    return () => {
      portalSocket.off("message:new", handleMessageNew);
    };
  }, [portalSocket]);

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

  return { conversations, isLoading, hasMore, loadMore };
}
