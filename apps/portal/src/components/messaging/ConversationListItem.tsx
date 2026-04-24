"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import type { ConversationPreview } from "@/hooks/use-conversation-list";

interface ConversationListItemProps {
  conversation: ConversationPreview;
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

function useFormatRelativeTime() {
  const t = useTranslations("Portal.messages");
  return (isoString: string): string => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = Math.max(0, now.getTime() - date.getTime());
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return t("timeJustNow");
    if (diffMins < 60) return t("timeMinutesAgo", { count: String(diffMins) });
    if (diffHours < 24) return t("timeHoursAgo", { count: String(diffHours) });
    if (diffDays === 1) return t("timeYesterday");
    return t("timeDaysAgo", { count: String(diffDays) });
  };
}

export function ConversationListItem({ conversation }: ConversationListItemProps) {
  const t = useTranslations("Portal.messages");
  const locale = useLocale();
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const formatRelativeTime = useFormatRelativeTime();

  const { otherMember, lastMessage, portalContext, updatedAt, unreadCount, applicationId } =
    conversation;

  const href = `/${locale}/conversations/${applicationId}`;

  let lastMessagePreview: string | null = null;
  if (lastMessage) {
    const rawPreview = truncate(lastMessage.content, 50);
    lastMessagePreview =
      lastMessage.senderId === userId ? t("lastMessageYou", { preview: rawPreview }) : rawPreview;
  }

  return (
    <li>
      <a
        href={href}
        className="flex w-full items-start gap-3 rounded-lg p-3 hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label={t("conversationWith", {
          name: otherMember.displayName,
          jobTitle: portalContext?.jobTitle ?? "",
        })}
        data-testid={`conversation-list-item-${conversation.id}`}
      >
        {/* Avatar placeholder */}
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold"
          aria-hidden="true"
        >
          {otherMember.displayName.charAt(0).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold">{otherMember.displayName}</p>
            <div className="flex shrink-0 items-center gap-1.5">
              {unreadCount > 0 && (
                <Badge
                  variant="destructive"
                  className="h-5 min-w-5 px-1.5 text-xs"
                  aria-label={t("unreadBadgeLabel", { count: String(unreadCount) })}
                  data-testid={`unread-badge-${conversation.id}`}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">{formatRelativeTime(updatedAt)}</span>
            </div>
          </div>

          {portalContext && (
            <p className="truncate text-xs text-muted-foreground">{portalContext.jobTitle}</p>
          )}

          {lastMessagePreview && (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{lastMessagePreview}</p>
          )}
        </div>
      </a>
    </li>
  );
}
