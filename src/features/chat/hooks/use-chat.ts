"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSocketContext } from "@/providers/SocketProvider";
import type { ChatMessage, SyncReplayPayload } from "@/features/chat/types";

/**
 * useChat — subscribes to chat events via the /chat Socket.IO namespace.
 *
 * - Tracks `lastReceivedAt` timestamp (updated on every message:new).
 * - Emits `sync:request` with { lastReceivedAt } on socket `connect` event
 *   to trigger server-side gap sync (AC: #7).
 * - Exposes `messages` (in-memory cache of received messages per conversation)
 *   and `sendMessage` helper.
 *
 * Note: UI conversation state (full history) comes from REST via
 * use-conversations.ts. This hook handles real-time deltas only.
 */
export function useChat(conversationId?: string) {
  const { chatSocket } = useSocketContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const lastReceivedAtRef = useRef<string | null>(null);

  // Emit sync:request on socket connect to handle reconnection gap sync
  useEffect(() => {
    if (!chatSocket) return;

    function handleConnect() {
      if (chatSocket) {
        chatSocket.emit("sync:request", {
          lastReceivedAt: lastReceivedAtRef.current ?? undefined,
        });
      }
    }

    // If already connected, trigger immediately
    if (chatSocket.connected) {
      handleConnect();
    }

    chatSocket.on("connect", handleConnect);
    return () => {
      chatSocket.off("connect", handleConnect);
    };
  }, [chatSocket]);

  // Subscribe to message:new events
  useEffect(() => {
    if (!chatSocket) return;

    function handleMessageNew(msg: ChatMessage) {
      // Update lastReceivedAt timestamp
      lastReceivedAtRef.current = msg.createdAt;

      // Only add to local state if it's for the active conversation (if provided)
      if (!conversationId || msg.conversationId === conversationId) {
        setMessages((prev) => [...prev, msg]);
      }
    }

    chatSocket.on("message:new", handleMessageNew);
    return () => {
      chatSocket.off("message:new", handleMessageNew);
    };
  }, [chatSocket, conversationId]);

  // Handle sync:replay — prepend replayed messages
  useEffect(() => {
    if (!chatSocket) return;

    function handleSyncReplay(payload: SyncReplayPayload) {
      const relevant = conversationId
        ? payload.messages.filter((m) => m.conversationId === conversationId)
        : payload.messages;

      if (relevant.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.messageId));
          const newMsgs = relevant.filter((m) => !existingIds.has(m.messageId));
          return [...newMsgs, ...prev];
        });
        // Update lastReceivedAt to the most recent replayed message
        const last = relevant[relevant.length - 1];
        if (last) lastReceivedAtRef.current = last.createdAt;
      }
    }

    chatSocket.on("sync:replay", handleSyncReplay);
    return () => {
      chatSocket.off("sync:replay", handleSyncReplay);
    };
  }, [chatSocket, conversationId]);

  const sendMessage = useCallback(
    (payload: { conversationId: string; content: string; contentType?: string }) => {
      return new Promise<{ messageId: string } | { error: string }>((resolve) => {
        if (!chatSocket) {
          resolve({ error: "Not connected" });
          return;
        }
        chatSocket.emit("message:send", payload, (response: unknown) => {
          resolve(response as { messageId: string } | { error: string });
        });
      });
    },
    [chatSocket],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    sendMessage,
    clearMessages,
    isConnected: chatSocket?.connected ?? false,
  };
}
