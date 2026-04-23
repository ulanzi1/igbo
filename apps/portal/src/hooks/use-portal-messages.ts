"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { usePortalSocket } from "@/providers/SocketProvider";

export type MessageStatus = "sending" | "sent" | "delivered" | "failed";

export interface PortalMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  contentType: string;
  parentMessageId: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  /** Client-side status tracking for optimistic messages */
  _status?: MessageStatus;
  /** Unique ID for the optimistic message before server confirmation */
  _optimisticId?: string;
}

interface UsePortalMessagesOptions {
  applicationId: string;
  /** The conversationId for this thread (used to filter socket events) */
  conversationId?: string;
  /** Skip fetching when false (e.g. no conversation exists yet) */
  enabled?: boolean;
}

interface UsePortalMessagesReturn {
  messages: PortalMessage[];
  isLoading: boolean;
  hasMore: boolean;
  loadOlder: () => void;
  sendMessage: (content: string) => Promise<void>;
  retryMessage: (optimisticId: string) => Promise<void>;
}

export function usePortalMessages({
  applicationId,
  conversationId,
  enabled = true,
}: UsePortalMessagesOptions): UsePortalMessagesReturn {
  const { portalSocket } = usePortalSocket();
  const { data: session } = useSession();
  const userId = session?.user?.id as string | undefined;

  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const seenIdsRef = useRef(new Set<string>());
  const oldestCursorRef = useRef<string | undefined>(undefined);
  const messagesRef = useRef<PortalMessage[]>([]);
  const isLoadingRef = useRef(false); // F17: ref-based lock for loadOlder

  // Keep messagesRef in sync (F15: for retryMessage without stale closure)
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Initial load
  useEffect(() => {
    if (!enabled || !applicationId) return;

    setIsLoading(true);
    isLoadingRef.current = true;
    seenIdsRef.current = new Set();
    oldestCursorRef.current = undefined;

    fetch(`/api/v1/conversations/${applicationId}/messages`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`); // F14: check r.ok
        return r.json() as Promise<{ data: { messages: PortalMessage[]; hasMore: boolean } }>;
      })
      .then((data) => {
        const msgs = data.data.messages;
        setMessages(msgs);
        setHasMore(data.data.hasMore);
        msgs.forEach((m) => seenIdsRef.current.add(m.id));
        if (msgs.length > 0) {
          oldestCursorRef.current = msgs[0]?.createdAt;
        }
      })
      .catch(console.error)
      .finally(() => {
        setIsLoading(false);
        isLoadingRef.current = false;
      });
  }, [applicationId, enabled]);

  // Real-time: append new messages from Socket.IO, dedup by id
  // F1: emit message:delivered back to server; listen for message:delivered broadcasts
  // F2: filter by conversationId so messages don't leak across conversations
  useEffect(() => {
    if (!portalSocket) return;

    const handleMessageNew = (msg: PortalMessage) => {
      // F2: Only process messages for THIS conversation
      if (conversationId && msg.conversationId !== conversationId) return;
      if (!msg.id || seenIdsRef.current.has(msg.id)) return;
      seenIdsRef.current.add(msg.id);
      setMessages((prev) => [...prev, { ...msg, _status: "delivered" }]);

      // F1: Emit delivery acknowledgment back to server (only for messages from others)
      if (msg.senderId !== userId) {
        portalSocket.emit("message:delivered", {
          messageId: msg.id,
          conversationId: msg.conversationId,
        });
      }
    };

    // F1: Listen for delivery confirmations from recipients to update sender's message status
    const handleMessageDelivered = (payload: { messageId: string; conversationId: string }) => {
      if (conversationId && payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId && m._status === "sent" ? { ...m, _status: "delivered" } : m,
        ),
      );
    };

    // F3: Handle sync:replay — merge missed messages after reconnect
    const handleSyncReplay = (payload: { messages: PortalMessage[]; hasMore: boolean }) => {
      const incoming = payload.messages ?? [];
      setMessages((prev) => {
        const newMsgs = incoming.filter(
          (m) =>
            !seenIdsRef.current.has(m.id) &&
            (!conversationId || m.conversationId === conversationId),
        );
        newMsgs.forEach((m) => seenIdsRef.current.add(m.id));
        if (newMsgs.length === 0) return prev;
        // Merge and sort by createdAt
        const merged = [...prev, ...newMsgs.map((m) => ({ ...m, _status: "delivered" as const }))];
        merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return merged;
      });
    };

    // F3: Handle sync:full_refresh — re-fetch all messages from REST
    const handleSyncFullRefresh = () => {
      if (!applicationId) return;
      seenIdsRef.current = new Set();
      oldestCursorRef.current = undefined;
      fetch(`/api/v1/conversations/${applicationId}/messages`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<{ data: { messages: PortalMessage[]; hasMore: boolean } }>;
        })
        .then((data) => {
          const msgs = data.data.messages;
          setMessages(msgs);
          setHasMore(data.data.hasMore);
          msgs.forEach((m) => seenIdsRef.current.add(m.id));
          if (msgs.length > 0) {
            oldestCursorRef.current = msgs[0]?.createdAt;
          }
        })
        .catch(console.error);
    };

    portalSocket.on("message:new", handleMessageNew);
    portalSocket.on("message:delivered", handleMessageDelivered);
    portalSocket.on("sync:replay", handleSyncReplay);
    portalSocket.on("sync:full_refresh", handleSyncFullRefresh);
    return () => {
      portalSocket.off("message:new", handleMessageNew);
      portalSocket.off("message:delivered", handleMessageDelivered);
      portalSocket.off("sync:replay", handleSyncReplay);
      portalSocket.off("sync:full_refresh", handleSyncFullRefresh);
    };
  }, [portalSocket, conversationId, applicationId, userId]);

  // F17: ref-based lock prevents duplicate concurrent fetches
  const loadOlder = useCallback(() => {
    if (!enabled || !applicationId || !hasMore || isLoadingRef.current) return;
    const cursor = oldestCursorRef.current;
    setIsLoading(true);
    isLoadingRef.current = true;
    const url = cursor
      ? `/api/v1/conversations/${applicationId}/messages?cursor=${encodeURIComponent(cursor)}`
      : `/api/v1/conversations/${applicationId}/messages`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`); // F14
        return r.json() as Promise<{ data: { messages: PortalMessage[]; hasMore: boolean } }>;
      })
      .then((data) => {
        const fresh = data.data.messages.filter((m) => !seenIdsRef.current.has(m.id));
        fresh.forEach((m) => seenIdsRef.current.add(m.id));
        setMessages((prev) => [...fresh, ...prev]);
        setHasMore(data.data.hasMore);
        if (fresh.length > 0) oldestCursorRef.current = fresh[0]?.createdAt;
      })
      .catch(console.error)
      .finally(() => {
        setIsLoading(false);
        isLoadingRef.current = false;
      });
  }, [applicationId, enabled, hasMore]);

  const sendMessage = useCallback(
    async (content: string) => {
      const optimisticId = `opt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const optimistic: PortalMessage = {
        id: optimisticId,
        conversationId: conversationId ?? "",
        senderId: userId ?? "", // F4: use actual userId for correct isSelf rendering
        content,
        contentType: "text",
        parentMessageId: null,
        editedAt: null,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        _status: "sending",
        _optimisticId: optimisticId,
      };

      setMessages((prev) => [...prev, optimistic]);

      try {
        const r = await fetch(`/api/v1/conversations/${applicationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, contentType: "text" }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as { data: { message: PortalMessage } };
        const sent = data.data.message;
        seenIdsRef.current.add(sent.id);
        setMessages((prev) =>
          prev.map((m) => (m._optimisticId === optimisticId ? { ...sent, _status: "sent" } : m)),
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) => (m._optimisticId === optimisticId ? { ...m, _status: "failed" } : m)),
        );
      }
    },
    [applicationId, conversationId, userId],
  );

  // F15: use messagesRef instead of messages to avoid stale closure + unnecessary re-renders
  const retryMessage = useCallback(
    async (optimisticId: string) => {
      const msg = messagesRef.current.find((m) => m._optimisticId === optimisticId);
      if (!msg) return;
      setMessages((prev) =>
        prev.map((m) => (m._optimisticId === optimisticId ? { ...m, _status: "sending" } : m)),
      );
      try {
        const r = await fetch(`/api/v1/conversations/${applicationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: msg.content, contentType: "text" }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as { data: { message: PortalMessage } };
        const sent = data.data.message;
        seenIdsRef.current.add(sent.id);
        setMessages((prev) =>
          prev.map((m) => (m._optimisticId === optimisticId ? { ...sent, _status: "sent" } : m)),
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) => (m._optimisticId === optimisticId ? { ...m, _status: "failed" } : m)),
        );
      }
    },
    [applicationId],
  );

  return { messages, isLoading, hasMore, loadOlder, sendMessage, retryMessage };
}
