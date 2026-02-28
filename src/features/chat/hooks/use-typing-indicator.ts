"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSocketContext } from "@/providers/SocketProvider";

const AUTO_EXPIRE_MS = 6_000; // 6s client-side expire (slightly longer than server's 5s Redis TTL)

export function useTypingIndicator(conversationId: string | undefined) {
  const { chatSocket } = useSocketContext();
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeTypingUser = useCallback((userId: string) => {
    setTypingUserIds((prev) => prev.filter((id) => id !== userId));
    const timer = timersRef.current.get(userId);
    if (timer !== undefined) clearTimeout(timer);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    timersRef.current.delete(userId);
  }, []);

  useEffect(() => {
    if (!chatSocket || !conversationId) return;

    // Reset typing state when switching conversations
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTypingUserIds([]);

    function handleTypingStart(payload: { userId: string; conversationId: string }) {
      if (payload.conversationId !== conversationId) return;
      const { userId } = payload;

      // Clear existing timer for this user
      const existing = timersRef.current.get(userId);
      if (existing !== undefined) clearTimeout(existing);

      // Add to typing list if not already there
      setTypingUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));

      // Auto-expire after AUTO_EXPIRE_MS (safety net in case typing:stop is missed)
      const timer = setTimeout(() => removeTypingUser(userId), AUTO_EXPIRE_MS);
      timersRef.current.set(userId, timer);
    }

    function handleTypingStop(payload: { userId: string; conversationId: string }) {
      if (payload.conversationId !== conversationId) return;
      removeTypingUser(payload.userId);
    }

    chatSocket.on("typing:start", handleTypingStart);
    chatSocket.on("typing:stop", handleTypingStop);

    return () => {
      chatSocket.off("typing:start", handleTypingStart);
      chatSocket.off("typing:stop", handleTypingStop);
      // Clear all timers on unmount
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, [chatSocket, conversationId, removeTypingUser]);

  return { typingUserIds };
}
