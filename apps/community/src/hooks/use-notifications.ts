"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSocket } from "./use-socket";
import type { PlatformNotification } from "@igbo/db/schema/platform-notifications";

interface NotificationsResponse {
  notifications: PlatformNotification[];
  unreadCount: number;
}

const NOTIFICATIONS_QUERY_KEY = ["notifications"] as const;

async function fetchNotifications(): Promise<NotificationsResponse> {
  const res = await fetch("/api/v1/notifications");
  if (!res.ok) throw new Error("Failed to fetch notifications");
  const json = (await res.json()) as { data: NotificationsResponse };
  return json.data;
}

/**
 * Hook for notification subscription.
 * - Uses TanStack Query for initial REST fetch and sync:full_refresh fallback
 * - Subscribes to notification:new and unread:update Socket.IO events
 * - Updates query cache on socket events (no separate local state)
 */
export function useNotifications() {
  const { notificationsSocket } = useSocket();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: fetchNotifications,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!notificationsSocket) return;

    function onNotificationNew(notif: PlatformNotification) {
      queryClient.setQueryData<NotificationsResponse>(NOTIFICATIONS_QUERY_KEY, (prev) => {
        if (!prev) return prev;
        return {
          notifications: [notif, ...prev.notifications],
          unreadCount: prev.unreadCount + 1,
        };
      });
    }

    function onUnreadUpdate(data: { increment?: number; count?: number }) {
      queryClient.setQueryData<NotificationsResponse>(NOTIFICATIONS_QUERY_KEY, (prev) => {
        if (!prev) return prev;
        const newCount =
          data.count !== undefined ? data.count : prev.unreadCount + (data.increment ?? 0);
        return { ...prev, unreadCount: Math.max(0, newCount) };
      });
    }

    function onSyncFullRefresh() {
      // Invalidate query so TanStack Query re-fetches via REST
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    }

    notificationsSocket.on("notification:new", onNotificationNew);
    notificationsSocket.on("unread:update", onUnreadUpdate);
    notificationsSocket.on("sync:full_refresh", onSyncFullRefresh);

    return () => {
      notificationsSocket.off("notification:new", onNotificationNew);
      notificationsSocket.off("unread:update", onUnreadUpdate);
      notificationsSocket.off("sync:full_refresh", onSyncFullRefresh);
    };
  }, [notificationsSocket, queryClient]);

  return {
    notifications: query.data?.notifications ?? [],
    unreadCount: query.data?.unreadCount ?? 0,
    isLoading: query.isLoading,
    error: query.error,
  };
}
