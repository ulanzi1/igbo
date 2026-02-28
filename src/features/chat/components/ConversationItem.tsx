"use client";

import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import type { ChatConversation } from "@/features/chat/types";
import { GroupAvatarStack } from "./GroupAvatarStack";

interface ConversationItemProps {
  conversation: ChatConversation;
  isActive?: boolean;
  isOnline?: boolean;
}

function formatGroupNames(
  members: Array<{ id: string; displayName: string; photoUrl: string | null }>,
  memberCount?: number,
): string {
  const names = members.slice(0, 3).map((m) => m.displayName);
  const extra = (memberCount ?? members.length) - names.length;
  if (extra > 0) {
    return `${names.join(", ")}, +${extra}`;
  }
  return names.join(", ");
}

function formatTime(isoString: string, yesterdayLabel: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (diffDays === 1) {
    return yesterdayLabel;
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function ConversationItem({
  conversation,
  isActive = false,
  isOnline,
}: ConversationItemProps) {
  const t = useTranslations("Chat");
  const hasUnread = conversation.unreadCount > 0;

  return (
    <Link
      href={`/chat/${conversation.id}`}
      className={cn(
        "flex items-center gap-3 px-4 py-3 border-b border-border transition-colors hover:bg-accent",
        isActive && "bg-primary/10 border-l-2 border-l-primary",
        hasUnread && !isActive && "bg-green-50/50 dark:bg-green-950/20",
      )}
      aria-current={isActive ? "page" : undefined}
    >
      {/* Avatar — single for direct, stacked for group */}
      <div className="relative flex-shrink-0">
        {conversation.type === "group" &&
        conversation.members &&
        conversation.members.length > 0 ? (
          <div className="flex h-10 w-10 items-center justify-center">
            <GroupAvatarStack members={conversation.members} size="sm" />
          </div>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-muted">
            {conversation.otherMember.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={conversation.otherMember.photoUrl}
                alt={conversation.otherMember.displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-sm font-semibold text-muted-foreground">
                {conversation.otherMember.displayName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        )}
        {isOnline && (
          <span
            className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-green-500"
            aria-label={t("conversations.online")}
            role="img"
          />
        )}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-1">
          <span
            className={cn(
              "truncate text-sm",
              hasUnread ? "font-semibold text-foreground" : "font-medium text-foreground",
            )}
          >
            {conversation.type === "group" && conversation.members
              ? formatGroupNames(conversation.members, conversation.memberCount)
              : conversation.otherMember.displayName}
          </span>
          {conversation.lastMessage && (
            <span className="flex-shrink-0 text-xs text-muted-foreground">
              {formatTime(conversation.lastMessage.createdAt, t("messages.yesterday"))}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-1">
          <p className="truncate text-xs text-muted-foreground">
            {conversation.type === "group" && conversation.lastMessage?.senderDisplayName
              ? `${conversation.lastMessage.senderDisplayName}: ${conversation.lastMessage.content}`
              : (conversation.lastMessage?.content ?? "")}
          </p>
          {hasUnread && (
            <span
              className="flex-shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground"
              role="status"
              aria-label={t("conversations.unreadMessages", { count: conversation.unreadCount })}
            >
              {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
