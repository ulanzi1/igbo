"use client";

import { useTranslations } from "next-intl";
import { NotificationItem } from "./NotificationItem";
import type { PlatformNotification } from "@/db/schema/platform-notifications";

interface NotificationListProps {
  notifications: PlatformNotification[];
  isLoading?: boolean;
  error?: Error | null;
  onRead?: (id: string) => void;
  onMarkAllRead?: () => void;
}

export function NotificationList({
  notifications,
  isLoading,
  error,
  onRead,
  onMarkAllRead,
}: NotificationListProps) {
  const t = useTranslations("Notifications");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center px-4 py-8 text-sm text-muted-foreground">
        {t("loading")}
      </div>
    );
  }

  if (error) {
    return <div className="px-4 py-8 text-center text-sm text-destructive">{t("error")}</div>;
  }

  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <div className="flex flex-col">
      {/* Header with mark-all-read */}
      {notifications.length > 0 && hasUnread && onMarkAllRead && (
        <div className="flex items-center justify-end border-b border-border px-4 py-2">
          <button
            type="button"
            onClick={onMarkAllRead}
            className="text-xs text-primary hover:underline"
          >
            {t("markAllRead")}
          </button>
        </div>
      )}

      {/* Empty state */}
      {notifications.length === 0 && (
        <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">{t("empty")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("emptyDescription")}</p>
        </div>
      )}

      {/* Notification items — reverse chronological order */}
      <ul role="list" className="max-h-96 overflow-y-auto divide-y divide-border">
        {notifications.map((notification) => (
          <li key={notification.id}>
            <NotificationItem notification={notification} onRead={onRead} />
          </li>
        ))}
      </ul>
    </div>
  );
}
