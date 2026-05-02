"use client";

import {
  BellIcon,
  SendIcon,
  EyeIcon,
  RefreshCwIcon,
  Undo2Icon,
  MessageSquareIcon,
  CheckCircleIcon,
  XCircleIcon,
  EditIcon,
  ClockIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { PortalNotification } from "@igbo/db/queries/portal-notifications";

interface NotificationItemProps {
  notification: PortalNotification;
  onMarkRead: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
}

// Icon mapping per eventType
const EVENT_TYPE_ICONS: Record<
  string,
  React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>
> = {
  "portal.application.submitted": SendIcon,
  "portal.application.viewed": EyeIcon,
  "portal.application.status_changed": RefreshCwIcon,
  "portal.application.withdrawn": Undo2Icon,
  "portal.message.received": MessageSquareIcon,
  "portal.job.approved": CheckCircleIcon,
  "portal.job.rejected": XCircleIcon,
  "portal.job.changes_requested": EditIcon,
  "portal.job.expired": ClockIcon,
  "portal.saved_search.new_results": SearchIcon,
};

const EVENT_TYPE_ICON_COLORS: Record<string, string> = {
  "portal.application.submitted": "text-teal-500",
  "portal.application.viewed": "text-amber-500",
  "portal.application.status_changed": "text-blue-500",
  "portal.application.withdrawn": "text-muted-foreground",
  "portal.message.received": "text-teal-500",
  "portal.job.approved": "text-green-500",
  "portal.job.rejected": "text-destructive",
  "portal.job.changes_requested": "text-amber-500",
  "portal.job.expired": "text-muted-foreground",
  "portal.saved_search.new_results": "text-blue-500",
};

export function getNotificationIcon(eventType: string) {
  return EVENT_TYPE_ICONS[eventType] ?? BellIcon;
}

export function NotificationItem({ notification, onMarkRead, onDismiss }: NotificationItemProps) {
  const t = useTranslations("Portal.notificationCenter");
  const router = useRouter();
  const isUnread = notification.readAt === null;
  const Icon = getNotificationIcon(notification.eventType);
  const iconColor = EVENT_TYPE_ICON_COLORS[notification.eventType] ?? "text-muted-foreground";

  const createdAt =
    notification.createdAt instanceof Date
      ? notification.createdAt
      : new Date(notification.createdAt as string);

  const secondsAgo = (Date.now() - createdAt.getTime()) / 1000;
  const relativeTime =
    secondsAgo < 60 ? t("justNow") : formatDistanceToNow(createdAt, { addSuffix: true });

  function handleClick() {
    void onMarkRead(notification.id);
    if (notification.link) {
      try {
        router.push(notification.link as "/");
      } catch {
        toast.error(t("itemUnavailable"));
      }
    }
  }

  async function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation();
    await onDismiss(notification.id);
  }

  async function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      await handleClick();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${t(isUnread ? "unreadNotification" : "readNotification")}: ${notification.title}`}
      onClick={() => void handleClick()}
      onKeyDown={(e) => void handleKeyDown(e)}
      data-testid="notification-item"
      data-unread={isUnread}
      className={[
        "group relative flex items-start gap-3 px-4 py-3 cursor-pointer",
        "hover:bg-muted/50 transition-colors",
        isUnread
          ? "border-l-2 border-primary font-semibold bg-muted/20"
          : "border-l-2 border-transparent",
      ].join(" ")}
    >
      {/* Event type icon */}
      <div className={`mt-0.5 shrink-0 ${iconColor}`}>
        <Icon className="size-5" aria-hidden="true" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm truncate ${isUnread ? "font-semibold text-foreground" : "text-muted-foreground"}`}
          data-testid="notification-title"
        >
          {notification.title}
        </p>
        <p
          className="text-xs text-muted-foreground truncate mt-0.5"
          data-testid="notification-body"
        >
          {notification.body}
        </p>
        <p className="text-xs text-muted-foreground mt-1" data-testid="notification-timestamp">
          {relativeTime}
        </p>
        {!isUnread && <span className="sr-only">{t("notificationRead")}</span>}
      </div>

      {/* Dismiss button */}
      <button
        type="button"
        onClick={(e) => void handleDismiss(e)}
        aria-label={t("dismiss")}
        data-testid="notification-dismiss"
        className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
      >
        <XIcon className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
