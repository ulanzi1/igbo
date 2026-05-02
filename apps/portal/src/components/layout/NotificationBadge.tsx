"use client";

import { BellIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useNotificationCount } from "@/providers/notification-count-context";

/**
 * Bell icon with unread notification count badge.
 * Hidden (display:none) when count is 0.
 * Reads unreadCount from NotificationCountContext (P-6.3).
 * Links to the notification center page (P-6.7).
 */
export function NotificationBadge() {
  const t = useTranslations("Portal.notifications");
  const { unreadCount } = useNotificationCount();

  const displayCount = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <Link
      href="/notifications"
      aria-label={t("badgeAriaLabel", { count: unreadCount })}
      data-testid="notification-badge-wrapper"
      className="relative inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
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
    </Link>
  );
}
