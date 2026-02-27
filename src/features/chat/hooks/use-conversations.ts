"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSocketContext } from "@/providers/SocketProvider";
import type { ChatConversation } from "@/features/chat/types";

interface ConversationsResponse {
  data: {
    conversations: ChatConversation[];
    meta: { cursor: string | null; hasMore: boolean };
  };
}

async function fetchConversations(): Promise<ChatConversation[]> {
  const res = await fetch("/api/v1/conversations");
  if (!res.ok) throw new Error("Failed to fetch conversations");
  const json = (await res.json()) as ConversationsResponse;
  return json.data.conversations;
}

/**
 * useConversations — conversation list with TanStack Query + Socket.IO invalidation.
 *
 * On new message:new event, invalidates the conversations query so the list
 * re-sorts by recency (updated_at changes when a message is sent).
 */
export function useConversations() {
  const queryClient = useQueryClient();
  const { chatSocket } = useSocketContext();

  const query = useQuery({
    queryKey: ["conversations"],
    queryFn: fetchConversations,
    staleTime: 30_000, // 30s — conversations don't change very frequently
  });

  // Invalidate on new message so conversation list re-sorts by recency
  useEffect(() => {
    if (!chatSocket) return;

    function handleMessageNew() {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }

    chatSocket.on("message:new", handleMessageNew);
    return () => {
      chatSocket.off("message:new", handleMessageNew);
    };
  }, [chatSocket, queryClient]);

  return {
    conversations: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
