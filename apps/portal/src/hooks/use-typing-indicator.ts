"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePortalSocket } from "@/providers/SocketProvider";

interface UseTypingIndicatorOptions {
  conversationId?: string;
  /** Current user's ID — excluded from typing display */
  userId?: string;
}

interface UseTypingIndicatorReturn {
  /** userId of the person currently typing, or null */
  typingUserId: string | null;
  /** Call when local user starts typing */
  emitTypingStart: () => void;
  /** Call when local user stops typing (e.g., on send) */
  emitTypingStop: () => void;
}

const THROTTLE_MS = 2_000; // Match SOCKET_RATE_LIMITS.TYPING_START.windowMs
const DISMISS_MS = 3_000; // Auto-dismiss after 3 seconds of no typing:start

/**
 * Manages typing indicators for portal 1:1 messaging.
 *
 * NOTE: This hook tracks a single `typingUserId` — a deliberate simplification
 * for 1:1 conversations (employer ↔ seeker). If portal ever adds group
 * conversations, this hook must be extended to track multiple typing users
 * (e.g., `typingUserIds: Set<string>`).
 */
export function useTypingIndicator({
  conversationId,
  userId,
}: UseTypingIndicatorOptions): UseTypingIndicatorReturn {
  const { portalSocket } = usePortalSocket();
  const [typingUserId, setTypingUserId] = useState<string | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmitRef = useRef(0); // Throttle tracking

  // Listen for typing events from other participants
  useEffect(() => {
    if (!portalSocket || !conversationId) return;

    const handleTypingStart = (payload: { userId: string; conversationId: string }) => {
      if (payload.conversationId !== conversationId) return;
      if (payload.userId === userId) return; // Ignore own typing events
      setTypingUserId(payload.userId);
      // Reset auto-dismiss timer
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => {
        setTypingUserId(null);
      }, DISMISS_MS);
    };

    const handleTypingStop = (payload: { userId: string; conversationId: string }) => {
      if (payload.conversationId !== conversationId) return;
      if (payload.userId === userId) return;
      setTypingUserId(null);
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };

    portalSocket.on("typing:start", handleTypingStart);
    portalSocket.on("typing:stop", handleTypingStop);
    return () => {
      portalSocket.off("typing:start", handleTypingStart);
      portalSocket.off("typing:stop", handleTypingStop);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      lastEmitRef.current = 0; // Reset throttle on conversation change
    };
  }, [portalSocket, conversationId, userId]);

  // Throttled emit for typing:start (max 1 per THROTTLE_MS)
  const emitTypingStart = useCallback(() => {
    if (!portalSocket || !conversationId) return;
    const now = Date.now();
    if (now - lastEmitRef.current < THROTTLE_MS) return;
    lastEmitRef.current = now;
    portalSocket.emit("typing:start", { conversationId });
  }, [portalSocket, conversationId]);

  // Immediate emit for typing:stop
  const emitTypingStop = useCallback(() => {
    if (!portalSocket || !conversationId) return;
    portalSocket.emit("typing:stop", { conversationId });
    lastEmitRef.current = 0; // Reset throttle so next typing:start fires immediately
  }, [portalSocket, conversationId]);

  return { typingUserId, emitTypingStart, emitTypingStop };
}
