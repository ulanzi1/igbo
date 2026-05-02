"use client";

import { BellIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useNotificationCount } from "@/providers/notification-count-context";

/**
 * Bell icon with unread notification count badge.
 * Hidden (display:none) when count is 0.
 * Reads unreadCount from NotificationCountContext (P-6.3).
 */
export function NotificationBadge() {
  const t = useTranslations("Portal.notifications");
  const { unreadCount } = useNotificationCount();

  const displayCount = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <span
      className="relative inline-flex items-center"
      aria-label={t("badgeAriaLabel", { count: unreadCount })}
      data-testid="notification-badge-wrapper"
    >
      <BellIcon className="size-5" aria-hidden="true" />
      {unreadCount > 0 && (
        <span
          className="absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground"
          data-testid="notification-badge-count"
          aria-hidden="true"
        >
          {displayCount}
        </span>
      )}
    </span>
  );
}
