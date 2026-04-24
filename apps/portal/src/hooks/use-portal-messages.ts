"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { usePortalSocket } from "@/providers/SocketProvider";

export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface MessageAttachment {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
}

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
  /** Attachments for this message */
  _attachments?: MessageAttachment[];
  /** Stored attachment IDs for retry (not from server) */
  _attachmentFileUploadIds?: string[];
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
  sendMessage: (content: string, attachmentFileUploadIds?: string[]) => Promise<void>;
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
  useEffect(() => {
    if (!portalSocket) return;

    const handleMessageNew = (msg: PortalMessage & { attachments?: MessageAttachment[] }) => {
      // F2: Only process messages for THIS conversation
      if (conversationId && msg.conversationId !== conversationId) return;
      if (!msg.id || seenIdsRef.current.has(msg.id)) return;
      seenIdsRef.current.add(msg.id);
      // Map `attachments` (no underscore, from bridge) → `_attachments` (underscore, PortalMessage type)
      setMessages((prev) => [
        ...prev,
        { ...msg, _status: "delivered", _attachments: msg.attachments ?? [] },
      ]);

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

    // Listen for read receipts — promote own sent/delivered messages to "read"
    const handleMessageRead = (payload: {
      conversationId: string;
      readerId: string;
      lastReadAt: string;
    }) => {
      if (conversationId && payload.conversationId !== conversationId) return;
      if (payload.readerId === userId) return;
      const readTs = new Date(payload.lastReadAt).getTime();
      setMessages((prev) =>
        prev.map((m) => {
          if (
            m.senderId === userId &&
            (m._status === "sent" || m._status === "delivered") &&
            new Date(m.createdAt).getTime() <= readTs
          ) {
            return { ...m, _status: "read" };
          }
          return m;
        }),
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
    portalSocket.on("message:read", handleMessageRead);
    portalSocket.on("sync:replay", handleSyncReplay);
    portalSocket.on("sync:full_refresh", handleSyncFullRefresh);
    return () => {
      portalSocket.off("message:new", handleMessageNew);
      portalSocket.off("message:delivered", handleMessageDelivered);
      portalSocket.off("message:read", handleMessageRead);
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
    async (content: string, attachmentFileUploadIds?: string[]) => {
      const optimisticId = `opt_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      // Build optimistic attachments from pending uploads metadata
      // (The caller passes attachmentFileUploadIds — we can't know fileUrl/fileName here,
      // so optimistic attachments use placeholder data; real data comes after server confirm)
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
        _attachmentFileUploadIds: attachmentFileUploadIds,
        _attachments: [],
      };

      setMessages((prev) => [...prev, optimistic]);

      try {
        const body: Record<string, unknown> = { content, contentType: "text" };
        if (attachmentFileUploadIds && attachmentFileUploadIds.length > 0) {
          body.attachmentFileUploadIds = attachmentFileUploadIds;
        }

        const r = await fetch(`/api/v1/conversations/${applicationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as {
          data: { message: PortalMessage; attachments?: MessageAttachment[] };
        };
        const sent = data.data.message;
        const serverAttachments = data.data.attachments ?? [];
        seenIdsRef.current.add(sent.id);
        setMessages((prev) =>
          prev.map((m) =>
            m._optimisticId === optimisticId
              ? { ...sent, _status: "sent", _attachments: serverAttachments }
              : m,
          ),
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
        const body: Record<string, unknown> = { content: msg.content, contentType: "text" };
        // VS15: Include attachment IDs stored on the optimistic message for retry
        if (msg._attachmentFileUploadIds && msg._attachmentFileUploadIds.length > 0) {
          body.attachmentFileUploadIds = msg._attachmentFileUploadIds;
        }

        const r = await fetch(`/api/v1/conversations/${applicationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as {
          data: { message: PortalMessage; attachments?: MessageAttachment[] };
        };
        const sent = data.data.message;
        const serverAttachments = data.data.attachments ?? [];
        seenIdsRef.current.add(sent.id);
        setMessages((prev) =>
          prev.map((m) =>
            m._optimisticId === optimisticId
              ? { ...sent, _status: "sent", _attachments: serverAttachments }
              : m,
          ),
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
