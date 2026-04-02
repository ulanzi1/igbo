"use client";

import { useEffect } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useSocketContext } from "@/providers/SocketProvider";
import type { ChatConversation } from "@/features/chat/types";

interface ConversationsPage {
  conversations: ChatConversation[];
  meta: { cursor: string | null; hasMore: boolean };
}

async function fetchConversationsPage(cursor?: string): Promise<ConversationsPage> {
  const url = new URL("/api/v1/conversations", window.location.origin);
  if (cursor) url.searchParams.set("cursor", cursor);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to fetch conversations");
  const json = (await res.json()) as { data: ConversationsPage };
  return json.data;
}

/**
 * useConversations — conversation list with TanStack Query infinite scroll + Socket.IO invalidation.
 *
 * Uses useInfiniteQuery for cursor-based pagination.
 * On new message:new event, invalidates the conversations query so the list
 * re-sorts by recency (updated_at changes when a message is sent).
 */
export function useConversations() {
  const queryClient = useQueryClient();
  const { chatSocket } = useSocketContext();

  const query = useInfiniteQuery({
    queryKey: ["conversations"],
    queryFn: ({ pageParam }) => fetchConversationsPage(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore && lastPage.meta.cursor ? lastPage.meta.cursor : undefined,
    staleTime: 30_000,
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

  // Flatten all pages into a single conversations array
  const conversations = query.data?.pages.flatMap((page) => page.conversations) ?? [];

  return {
    conversations,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}
