"use client";

/**
 * Spike: TanStack Query + Socket.IO optimistic update pattern (Epic 2 prep).
 *
 * Demonstrates the two core patterns for all Epic 2 conversation views:
 *
 * 1. CURSOR-BASED INFINITE QUERY — Load message history with useInfiniteQuery.
 *    Calling fetchNextPage() loads older messages (scroll-up pagination).
 *
 * 2. OPTIMISTIC SEND — useMutation adds a temp message immediately, emits via
 *    socket, then replaces the temp on server ack or rolls back on failure.
 *
 * ChatMessage type is provisional — replace with the Drizzle-generated type
 * from the messages schema once Epic 2 creates the table.
 */

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useCallback } from "react";
import { useSocket } from "./use-socket";

// Provisional type — will be replaced by DB schema type in Epic 2
export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string; // ISO 8601
  status?: "sending" | "sent" | "failed";
}

interface MessagesPage {
  items: ChatMessage[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface SendAck extends ChatMessage {
  tempId: string;
}

// ─── Query helpers ────────────────────────────────────────────────────────────

function messagesQueryKey(conversationId: string) {
  return ["messages", conversationId] as const;
}

async function fetchMessages(conversationId: string, cursor: string | null): Promise<MessagesPage> {
  const params = new URLSearchParams({ limit: "40" });
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`/api/v1/conversations/${conversationId}/messages?${params}`);
  if (!res.ok) throw new Error("Failed to fetch messages");
  const json = (await res.json()) as { data: MessagesPage };
  return json.data;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * useChatMessages — manages message history and send for a single conversation.
 *
 * @param conversationId  The conversation to load and subscribe to.
 */
export function useChatMessages(conversationId: string) {
  const { chatSocket } = useSocket();
  const queryClient = useQueryClient();
  const queryKey = messagesQueryKey(conversationId);

  // ── 1. Cursor-based infinite query ──────────────────────────────────────────
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchMessages(conversationId, pageParam as string | null),
    initialPageParam: null,
    // getNextPageParam drives the "load older" scroll-up pagination:
    // nextCursor from the last fetched page becomes the cursor for the next fetch.
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 60_000,
  });

  // Flat list across all pages, newest-first (pages[0] = newest batch)
  const messages = query.data?.pages.flatMap((p) => p.items) ?? [];

  // ── 2. Real-time: push server-broadcast messages into cache ────────────────
  // queryKey is computed inside the effect to avoid a new array reference on every render
  // causing repeated subscribe/unsubscribe cycles. conversationId is already in deps.
  useEffect(() => {
    if (!chatSocket) return;
    const key = messagesQueryKey(conversationId);

    function onMessageNew(msg: ChatMessage) {
      if (msg.conversationId !== conversationId) return;

      queryClient.setQueryData(
        key,
        (prev: { pages: MessagesPage[]; pageParams: unknown[] } | undefined) => {
          if (!prev) return prev;
          const [firstPage, ...rest] = prev.pages;
          if (!firstPage) return prev;
          // Dedup: skip if we already have this id (e.g., sender's own ack already placed it)
          if (firstPage.items.some((m) => m.id === msg.id)) return prev;
          return {
            ...prev,
            pages: [{ ...firstPage, items: [msg, ...firstPage.items] }, ...rest],
          };
        },
      );
    }

    chatSocket.on("message:new", onMessageNew);
    return () => {
      chatSocket.off("message:new", onMessageNew);
    };
  }, [chatSocket, conversationId, queryClient]);

  // ── 3. Send with optimistic update ──────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: (body: string): Promise<ChatMessage> => {
      return new Promise((resolve, reject) => {
        if (!chatSocket) {
          reject(new Error("Socket not connected"));
          return;
        }
        const tempId = `temp_${Date.now()}`;
        // Socket.IO acknowledgement callback: server calls back with { message } or { error }
        chatSocket.emit(
          "message:send",
          { conversationId, body, tempId },
          (ack: SendAck | { error: string }) => {
            if ("error" in ack) {
              reject(new Error(ack.error));
            } else {
              resolve(ack);
            }
          },
        );
      });
    },

    onMutate: async (body: string) => {
      // Cancel in-flight refetches to avoid overwriting optimistic state
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData(queryKey);

      const tempId = `temp_${Date.now()}`;
      const tempMsg: ChatMessage = {
        id: tempId,
        conversationId,
        senderId: "me", // server replaces this with real userId on ack
        body,
        createdAt: new Date().toISOString(),
        status: "sending",
      };

      queryClient.setQueryData(
        queryKey,
        (prev: { pages: MessagesPage[]; pageParams: unknown[] } | undefined) => {
          if (!prev) return prev;
          const [firstPage, ...rest] = prev.pages;
          if (!firstPage) return prev;
          return {
            ...prev,
            pages: [{ ...firstPage, items: [tempMsg, ...firstPage.items] }, ...rest],
          };
        },
      );

      return { snapshot, tempId };
    },

    onError: (_err, _body, context) => {
      // Roll back to snapshot before the optimistic insert
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(queryKey, context.snapshot);
      }
    },

    onSuccess: (realMsg, _body, context) => {
      // Replace the temp message with the confirmed message from the server
      queryClient.setQueryData(
        queryKey,
        (prev: { pages: MessagesPage[]; pageParams: unknown[] } | undefined) => {
          if (!prev) return prev;
          return {
            ...prev,
            pages: prev.pages.map((page) => ({
              ...page,
              items: page.items.map((m) =>
                m.id === context?.tempId ? { ...realMsg, status: "sent" as const } : m,
              ),
            })),
          };
        },
      );
    },
  });

  const sendMessage = useCallback((body: string) => sendMutation.mutate(body), [sendMutation]);

  return {
    messages,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    sendMessage,
    isSending: sendMutation.isPending,
    sendError: sendMutation.error,
  };
}
