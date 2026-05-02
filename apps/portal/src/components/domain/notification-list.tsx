"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { BellIcon } from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";
import { useNotificationCount } from "@/providers/notification-count-context";
import { NotificationItem } from "./notification-item";

/**
 * Full notification center list with:
 * - Infinite scroll via IntersectionObserver
 * - Mark All as Read button
 * - Empty state
 * - Loading skeleton
 */
export function NotificationList() {
  const t = useTranslations("Portal.notificationCenter");
  const { decrement, resetUnreadCount } = useNotificationCount();
  const { notifications, isLoading, hasMore, error, markAsRead, markAllAsRead, dismiss, loadMore } =
    useNotifications();

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoading) {
          void loadMore();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isLoading, loadMore]);

  const allRead = notifications.length > 0 && notifications.every((n) => n.readAt !== null);

  async function handleMarkAsRead(id: string) {
    const notification = notifications.find((n) => n.id === id);
    const wasUnread = notification?.readAt === null;
    const ok = await markAsRead(id);
    if (wasUnread && ok) decrement();
  }

  async function handleDismiss(id: string) {
    const notification = notifications.find((n) => n.id === id);
    const wasUnread = notification?.readAt === null;
    const ok = await dismiss(id);
    if (wasUnread && ok) decrement();
    if (ok) toast(t("dismissed"));
  }

  async function handleMarkAllRead() {
    const ok = await markAllAsRead();
    if (ok) {
      resetUnreadCount();
      toast(t("markAllReadSuccess"));
    }
  }

  return (
    <div className="flex flex-col">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h1 className="text-lg font-semibold" data-testid="notification-center-title">
          {t("title")}
        </h1>
        {notifications.length > 0 && (
          <button
            type="button"
            onClick={() => void handleMarkAllRead()}
            disabled={allRead}
            data-testid="mark-all-read-button"
            className="text-sm text-primary hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
          >
            {t("markAllRead")}
          </button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <p className="px-4 py-3 text-sm text-destructive" data-testid="notification-error">
          {error}
        </p>
      )}

      {/* Loading skeleton */}
      {isLoading && notifications.length === 0 && (
        <div aria-label={t("loading")} data-testid="notification-skeleton">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-border/50">
              <div className="mt-0.5 size-5 shrink-0 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && notifications.length === 0 && !error && (
        <div
          className="flex flex-col items-center justify-center py-16 px-4 text-center"
          data-testid="notification-empty-state"
        >
          <BellIcon className="size-10 text-muted-foreground mb-3" aria-hidden="true" />
          <p className="font-medium text-foreground">{t("noNotifications")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("noNotificationsDescription")}</p>
        </div>
      )}

      {/* Notification list */}
      {notifications.length > 0 && (
        <ul role="list" aria-label={t("title")} data-testid="notification-list">
          {notifications.map((notification) => (
            <li key={notification.id} className="border-b border-border/50 last:border-0">
              <NotificationItem
                notification={notification}
                onMarkRead={handleMarkAsRead}
                onDismiss={handleDismiss}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} aria-hidden="true" data-testid="scroll-sentinel" />

      {/* Load more loading indicator */}
      {isLoading && notifications.length > 0 && (
        <p className="px-4 py-3 text-sm text-muted-foreground text-center" aria-live="polite">
          {t("loading")}
        </p>
      )}
    </div>
  );
}
