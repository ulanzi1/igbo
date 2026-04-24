"use client";

import React, { createContext, useContext } from "react";
import { useUnreadMessageCount as useUnreadMessageCountHook } from "@/hooks/use-unread-message-count";

interface UnreadMessageCountValue {
  totalUnread: number;
  resetConversation: (conversationId: string) => void;
}

const UnreadMessageCountCtx = createContext<UnreadMessageCountValue | null>(null);

/**
 * Wraps useUnreadMessageCount in a context so that multiple consumers
 * (PortalTopNav + PortalBottomNav badges) share a single hook instance,
 * avoiding doubled API calls and socket listeners (P10).
 */
export function UnreadMessageCountProvider({ children }: { children: React.ReactNode }) {
  const value = useUnreadMessageCountHook();
  return <UnreadMessageCountCtx.Provider value={value}>{children}</UnreadMessageCountCtx.Provider>;
}

export function useUnreadMessageCount(): UnreadMessageCountValue {
  const ctx = useContext(UnreadMessageCountCtx);
  // Fallback for components rendered outside the provider (e.g. tests).
  return ctx ?? { totalUnread: 0, resetConversation: () => {} };
}
