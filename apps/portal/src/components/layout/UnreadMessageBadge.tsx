"use client";

import { useTranslations } from "next-intl";
import { useUnreadMessageCount } from "@/providers/unread-message-count-context";

/**
 * Lightweight badge that shows total unread portal message count.
 * Renders nothing when totalUnread is 0.
 * Used by PortalTopNav and PortalBottomNav for the Messages nav link.
 */
export function UnreadMessageBadge() {
  const t = useTranslations("Portal.messages");
  const { totalUnread } = useUnreadMessageCount();

  if (totalUnread === 0) return null;

  const displayCount = totalUnread > 99 ? "99+" : String(totalUnread);

  return (
    <span
      className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground"
      aria-label={t("unreadBadgeLabel", { count: String(totalUnread) })}
      data-testid="unread-message-badge"
    >
      {displayCount}
    </span>
  );
}
