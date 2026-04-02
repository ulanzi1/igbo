"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSocketContext } from "@/providers/SocketProvider";
import type { ChatMessage } from "@/features/chat/types";

/**
 * useUnreadCount — tracks total unread message count across all conversations.
 *
 * - Increments on message:new events when not in the active conversation
 * - Resets a conversation's count when it is opened (via derived state)
 * - Provides a method to mark a conversation as read (reset its count)
 */
export function useUnreadCount(activeConversationId?: string) {
  const { chatSocket } = useSocketContext();
  // Map of conversationId -> unread count (raw, before filtering active)
  const [rawCounts, setRawCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!chatSocket) return;

    function handleMessageNew(msg: ChatMessage) {
      // Don't count messages in the currently active conversation
      if (msg.conversationId === activeConversationId) return;

      setRawCounts((prev) => ({
        ...prev,
        [msg.conversationId]: (prev[msg.conversationId] ?? 0) + 1,
      }));
    }

    chatSocket.on("message:new", handleMessageNew);
    return () => {
      chatSocket.off("message:new", handleMessageNew);
    };
  }, [chatSocket, activeConversationId]);

  // Derive unread counts excluding the active conversation
  const unreadCounts = useMemo(() => {
    if (!activeConversationId || !rawCounts[activeConversationId]) {
      return rawCounts;
    }
    const filtered = { ...rawCounts };
    delete filtered[activeConversationId];
    return filtered;
  }, [rawCounts, activeConversationId]);

  const markConversationRead = useCallback((conversationId: string) => {
    setRawCounts((prev) => {
      if (!prev[conversationId]) return prev;
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
  }, []);

  const totalUnread = Object.values(unreadCounts).reduce((sum, n) => sum + n, 0);

  return {
    totalUnread,
    unreadCounts,
    markConversationRead,
  };
}
