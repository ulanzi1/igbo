"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { usePortalSocket } from "@/providers/SocketProvider";

interface ConversationEntry {
  id: string;
  unreadCount: number;
}

interface UseUnreadMessageCountReturn {
  totalUnread: number;
  resetConversation: (conversationId: string) => void;
}

/**
 * Lightweight hook that tracks the total unread message count across all portal conversations.
 * Used by nav components for the badge display (not for the full conversations list).
 *
 * Design:
 * - Fetches GET /api/v1/conversations once on mount to get initial counts
 * - Increments totalUnread locally on message:new from another user (no re-fetch)
 * - Re-fetches after socket reconnect to restore authoritative count
 * - resetConversation() zeroes the per-conversation count (called when thread is opened)
 * - totalUnread never goes below 0
 * - Handles fetch errors gracefully (returns 0)
 */
export function useUnreadMessageCount(): UseUnreadMessageCountReturn {
  const { data: session } = useSession();
  const userId = session?.user?.id as string | undefined;
  const { portalSocket, isConnected } = usePortalSocket();

  // Per-conversation unread counts (keyed by conversationId)
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Track whether we have fetched the initial state
  const hasFetchedRef = useRef(false);

  // Fetch the conversation list and extract unread counts
  const fetchCounts = useCallback(() => {
    fetch("/api/v1/conversations")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{
          data: { conversations: Array<ConversationEntry> };
        }>;
      })
      .then((data) => {
        const next: Record<string, number> = {};
        for (const conv of data.data.conversations) {
          next[conv.id] = conv.unreadCount ?? 0;
        }
        setCounts(next);
      })
      .catch(() => {
        // Silently swallow fetch errors — badge stays at 0
      });
  }, []);

  // Reset fetch state when userId changes (logout/login as different user)
  const prevUserIdRef = useRef(userId);
  useEffect(() => {
    if (prevUserIdRef.current !== userId) {
      prevUserIdRef.current = userId;
      hasFetchedRef.current = false;
      setCounts({});
    }
  }, [userId]);

  // Initial fetch on mount (once, only when authenticated)
  useEffect(() => {
    if (!userId || hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetchCounts();
  }, [userId, fetchCounts]);

  // Re-fetch on socket reconnect to restore authoritative count
  const prevConnected = useRef(isConnected);
  useEffect(() => {
    const wasDisconnected = !prevConnected.current;
    prevConnected.current = isConnected;
    if (isConnected && wasDisconnected && hasFetchedRef.current) {
      fetchCounts();
    }
  }, [isConnected, fetchCounts]);

  // Listen to message:new socket events — increment count for messages from other users
  useEffect(() => {
    if (!portalSocket || !userId) return;

    const handleMessageNew = (msg: { conversationId: string; senderId: string }) => {
      // Only increment for messages from other users
      if (msg.senderId === userId) return;

      setCounts((prev) => ({
        ...prev,
        [msg.conversationId]: (prev[msg.conversationId] ?? 0) + 1,
      }));
    };

    portalSocket.on("message:new", handleMessageNew);
    return () => {
      portalSocket.off("message:new", handleMessageNew);
    };
  }, [portalSocket, userId]);

  // Called when user opens a conversation — zero out that conversation's count
  const resetConversation = useCallback((conversationId: string) => {
    setCounts((prev) => {
      if (!(conversationId in prev) || prev[conversationId] === 0) return prev;
      return { ...prev, [conversationId]: 0 };
    });
  }, []);

  // Sum all per-conversation counts; clamp to 0
  const totalUnread = Math.max(
    0,
    Object.values(counts).reduce((sum, n) => sum + n, 0),
  );

  return { totalUnread, resetConversation };
}
