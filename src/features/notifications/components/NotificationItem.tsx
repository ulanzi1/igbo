"use client";

import { useTranslations } from "next-intl";
import { BellIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "@/i18n/navigation";
import type { PlatformNotification } from "@/db/schema/platform-notifications";

/**
 * Resolve notification text — if it looks like an i18n key (e.g. "notifications.member_approved.title"),
 * strip the "notifications." prefix and translate via the Notifications namespace.
 * Falls back to raw text for dynamic content (e.g. event titles, feedback strings).
 */
function resolveNotificationText(text: string, t: ReturnType<typeof useTranslations>): string {
  if (text.startsWith("notifications.")) {
    const key = text.slice("notifications.".length);
    if (t.has(key)) {
      return t(key);
    }
  }
  return text;
}

interface NotificationItemProps {
  notification: PlatformNotification;
  onRead?: (id: string) => void;
}

function formatTimeAgo(date: Date, t: ReturnType<typeof useTranslations>): string {
  const now = Date.now();
  const diffMs = now - new Date(date).getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 1) return t("timeAgo.justNow");
  if (diffMinutes < 60) return t("timeAgo.minutesAgo", { count: diffMinutes });
  if (diffHours < 24) return t("timeAgo.hoursAgo", { count: diffHours });
  return t("timeAgo.daysAgo", { count: diffDays });
}

export function NotificationItem({ notification, onRead }: NotificationItemProps) {
  const t = useTranslations("Notifications");
  const router = useRouter();

  const handleClick = () => {
    if (!notification.isRead && onRead) {
      onRead(notification.id);
    }
    if (notification.link) {
      router.push(notification.link);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
        !notification.isRead && "bg-primary/5",
      )}
      aria-label={notification.title}
    >
      {/* Icon */}
      <div
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
          notification.isRead ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
        )}
      >
        <BellIcon className="size-4" aria-hidden="true" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm",
            !notification.isRead ? "font-semibold text-foreground" : "font-normal text-foreground",
          )}
        >
          {resolveNotificationText(notification.title, t)}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {resolveNotificationText(notification.body, t)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          {formatTimeAgo(notification.createdAt, t)}
        </p>
      </div>

      {/* Unread dot */}
      {!notification.isRead && (
        <span
          className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
          aria-label={t("markRead")}
        />
      )}
    </button>
  );
}
