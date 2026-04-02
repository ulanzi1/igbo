"use client";

import { useState, useCallback, useRef } from "react";
import type { ChatMessageReaction } from "@/features/chat/types";
import type { AggregatedReaction } from "@/features/chat/components/ReactionBadges";

/**
 * Aggregate raw reaction rows into display format.
 * Groups by emoji; sets hasOwnReaction for current user.
 */
export function aggregateReactions(
  reactions: ChatMessageReaction[],
  currentUserId: string,
): AggregatedReaction[] {
  const map = new Map<string, { count: number; hasOwnReaction: boolean }>();
  for (const r of reactions) {
    const existing = map.get(r.emoji) ?? { count: 0, hasOwnReaction: false };
    map.set(r.emoji, {
      count: existing.count + 1,
      hasOwnReaction: existing.hasOwnReaction || r.userId === currentUserId,
    });
  }
  return Array.from(map.entries()).map(([emoji, { count, hasOwnReaction }]) => ({
    emoji,
    count,
    hasOwnReaction,
  }));
}

interface UseReactionsParams {
  messageId: string;
  conversationId: string;
  initialReactions: ChatMessageReaction[];
  currentUserId: string;
}

/**
 * useReactions — manages optimistic add/remove reactions with REST API sync.
 */
export function useReactions({
  messageId,
  conversationId,
  initialReactions,
  currentUserId,
}: UseReactionsParams) {
  const [reactions, setReactions] = useState<ChatMessageReaction[]>(initialReactions ?? []);
  // Track the last confirmed server state for accurate rollback
  const confirmedStateRef = useRef<ChatMessageReaction[]>(initialReactions ?? []);

  const toggleReaction = useCallback(
    async (emoji: string) => {
      const alreadyReacted = reactions.some((r) => r.emoji === emoji && r.userId === currentUserId);

      // Snapshot current state before optimistic update for rollback
      const snapshotBeforeOptimistic = [...reactions];

      // Optimistic update
      if (alreadyReacted) {
        setReactions((prev) =>
          prev.filter((r) => !(r.emoji === emoji && r.userId === currentUserId)),
        );
      } else {
        const optimisticReaction: ChatMessageReaction = {
          emoji,
          userId: currentUserId,
          createdAt: new Date().toISOString(),
        };
        setReactions((prev) => [...prev, optimisticReaction]);
      }

      try {
        const url = `/api/v1/conversations/${conversationId}/messages/${messageId}/reactions`;
        const method = alreadyReacted ? "DELETE" : "POST";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji }),
        });
        if (!res.ok) throw new Error("Reaction request failed");
        // On success, update confirmed state to reflect the optimistic change
        setReactions((current) => {
          confirmedStateRef.current = current;
          return current;
        });
      } catch {
        // Rollback to state before this optimistic update (not initial state)
        setReactions(snapshotBeforeOptimistic);
      }
    },
    [reactions, currentUserId, messageId, conversationId],
  );

  const applyReactionEvent = useCallback(
    (payload: { emoji: string; userId: string; action: "added" | "removed" }) => {
      if (payload.action === "added") {
        setReactions((prev) => {
          // Avoid duplicate
          const exists = prev.some((r) => r.emoji === payload.emoji && r.userId === payload.userId);
          if (exists) return prev;
          return [
            ...prev,
            { emoji: payload.emoji, userId: payload.userId, createdAt: new Date().toISOString() },
          ];
        });
      } else {
        setReactions((prev) =>
          prev.filter((r) => !(r.emoji === payload.emoji && r.userId === payload.userId)),
        );
      }
    },
    [],
  );

  return {
    reactions,
    aggregated: aggregateReactions(reactions, currentUserId),
    toggleReaction,
    applyReactionEvent,
  };
}
