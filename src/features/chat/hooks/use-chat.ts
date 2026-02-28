"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSocketContext } from "@/providers/SocketProvider";
import type { ChatMessage, ChatMessageReaction, SyncReplayPayload } from "@/features/chat/types";

interface ReactionPayload {
  messageId: string;
  conversationId: string;
  userId: string;
  emoji: string;
  action: "added" | "removed";
}

/**
 * Pure helper — compute updated reactions list from a reaction event.
 * Used for real-time cache updates.
 */
export function computeUpdatedReactions(
  existing: ChatMessageReaction[],
  payload: ReactionPayload,
): ChatMessageReaction[] {
  if (payload.action === "added") {
    const alreadyExists = existing.some(
      (r) => r.emoji === payload.emoji && r.userId === payload.userId,
    );
    if (alreadyExists) return existing;
    return [
      ...existing,
      { emoji: payload.emoji, userId: payload.userId, createdAt: new Date().toISOString() },
    ];
  } else {
    return existing.filter((r) => !(r.emoji === payload.emoji && r.userId === payload.userId));
  }
}

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

      // Ensure attachments and reactions are always arrays (defensive)
      const normalized: ChatMessage = {
        ...msg,
        attachments: msg.attachments ?? [],
        reactions: msg.reactions ?? [],
      };

      // Only add to local state if it's for the active conversation (if provided)
      if (!conversationId || normalized.conversationId === conversationId) {
        setMessages((prev) => [...prev, normalized]);
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
          const newMsgs = relevant
            .filter((m) => !existingIds.has(m.messageId))
            .map((m) => ({
              ...m,
              attachments: m.attachments ?? [],
              reactions: m.reactions ?? [],
            }));
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

  // Subscribe to message:edited and message:deleted events
  useEffect(() => {
    if (!chatSocket) return;

    function handleMessageEdited(payload: {
      messageId: string;
      conversationId: string;
      content: string;
      editedAt: string;
    }) {
      if (conversationId && payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.messageId === payload.messageId
            ? { ...m, content: payload.content, editedAt: payload.editedAt }
            : m,
        ),
      );
    }

    function handleMessageDeleted(payload: {
      messageId: string;
      conversationId: string;
      timestamp: string;
    }) {
      if (conversationId && payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.messageId === payload.messageId
            ? { ...m, content: "", deletedAt: payload.timestamp }
            : m,
        ),
      );
    }

    chatSocket.on("message:edited", handleMessageEdited);
    chatSocket.on("message:deleted", handleMessageDeleted);
    return () => {
      chatSocket.off("message:edited", handleMessageEdited);
      chatSocket.off("message:deleted", handleMessageDeleted);
    };
  }, [chatSocket, conversationId]);

  // Subscribe to reaction:added and reaction:removed events
  useEffect(() => {
    if (!chatSocket) return;

    function handleReactionChange(payload: ReactionPayload) {
      if (conversationId && payload.conversationId !== conversationId) return;

      setMessages((prev) =>
        prev.map((m) =>
          m.messageId === payload.messageId
            ? { ...m, reactions: computeUpdatedReactions(m.reactions, payload) }
            : m,
        ),
      );
    }

    chatSocket.on("reaction:added", handleReactionChange);
    chatSocket.on("reaction:removed", handleReactionChange);
    return () => {
      chatSocket.off("reaction:added", handleReactionChange);
      chatSocket.off("reaction:removed", handleReactionChange);
    };
  }, [chatSocket, conversationId]);

  const sendMessage = useCallback(
    (payload: {
      conversationId: string;
      content: string;
      contentType?: string;
      attachmentFileUploadIds?: string[];
      parentMessageId?: string;
    }) => {
      return new Promise<{ messageId: string } | { error: string }>((resolve) => {
        if (!chatSocket) {
          resolve({ error: "Not connected" });
          return;
        }
        const timeout = setTimeout(() => resolve({ error: "Request timed out" }), 10_000);
        chatSocket.emit("message:send", payload, (response: unknown) => {
          clearTimeout(timeout);
          resolve(response as { messageId: string } | { error: string });
        });
      });
    },
    [chatSocket],
  );

  const editMessage = useCallback(
    (messageId: string, conversationId: string, content: string) => {
      return new Promise<{ success: boolean; error?: string }>((resolve) => {
        if (!chatSocket) {
          resolve({ success: false, error: "Not connected" });
          return;
        }
        const timeout = setTimeout(
          () => resolve({ success: false, error: "Request timed out" }),
          10_000,
        );
        chatSocket.emit("message:edit", { messageId, conversationId, content }, (ack: unknown) => {
          clearTimeout(timeout);
          const response = ack as { ok?: boolean; error?: string };
          if (response?.ok) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: response?.error ?? "Unknown error" });
          }
        });
      });
    },
    [chatSocket],
  );

  const deleteMessage = useCallback(
    (messageId: string, conversationId: string) => {
      return new Promise<{ success: boolean; error?: string }>((resolve) => {
        if (!chatSocket) {
          resolve({ success: false, error: "Not connected" });
          return;
        }
        const timeout = setTimeout(
          () => resolve({ success: false, error: "Request timed out" }),
          10_000,
        );
        chatSocket.emit("message:delete", { messageId, conversationId }, (ack: unknown) => {
          clearTimeout(timeout);
          const response = ack as { ok?: boolean; error?: string };
          if (response?.ok) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: response?.error ?? "Unknown error" });
          }
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
    editMessage,
    deleteMessage,
    clearMessages,
    isConnected: chatSocket?.connected ?? false,
  };
}
