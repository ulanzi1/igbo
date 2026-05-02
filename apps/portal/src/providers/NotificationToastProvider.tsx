"use client";

import React, { useState, useCallback, useEffect } from "react";
import { NotificationCountContext } from "./notification-count-context";
import { useNotificationToast } from "@/hooks/use-notification-toast";

export { NotificationCountContext, useNotificationCount } from "./notification-count-context";

function NotificationToastInner({ children }: { children: React.ReactNode }) {
  // Mount the hook inside the provider so context is available
  useNotificationToast();
  return <>{children}</>;
}

/**
 * Owns the integer unreadCount state for portal notification badges.
 * Must nest inside NextIntlClientProvider so the toast hook can call useTranslations().
 * (P-6.3)
 */
export function NotificationToastProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);

  const increment = useCallback(() => {
    setUnreadCount((n) => n + 1);
  }, []);

  const resetUnreadCount = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const syncFromServer = useCallback(() => {
    fetch("/api/v1/notifications/unread-count")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ data: { count: number } }>;
      })
      .then((json) => {
        setUnreadCount(json.data.count);
      })
      .catch((err: unknown) => {
        console.warn(
          JSON.stringify({
            level: "warn",
            message: "portal.notification-badge.sync-failed",
            error: String(err),
          }),
        );
      });
  }, []);

  // Seed badge with server truth on mount (socket connect event may have already fired)
  useEffect(() => {
    syncFromServer();
  }, [syncFromServer]);

  return (
    <NotificationCountContext.Provider
      value={{ unreadCount, increment, resetUnreadCount, syncFromServer }}
    >
      <NotificationToastInner>{children}</NotificationToastInner>
    </NotificationCountContext.Provider>
  );
}
