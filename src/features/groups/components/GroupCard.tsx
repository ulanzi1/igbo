"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { DirectoryGroupItem } from "@/db/queries/groups";
import type { GroupMemberRole, GroupMemberStatus } from "@/db/schema/community-groups";

interface GroupCardProps {
  group: DirectoryGroupItem;
  viewerMembership: { role: GroupMemberRole; status: GroupMemberStatus } | null;
  onJoin?: (groupId: string) => Promise<void>;
  onRequestJoin?: (groupId: string) => Promise<void>;
}

export function GroupCard({ group, viewerMembership, onJoin, onRequestJoin }: GroupCardProps) {
  const t = useTranslations("Groups");
  const [isLoading, setIsLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const visibilityKey = group.visibility as "public" | "private" | "hidden";
  const isFull = group.memberLimit !== null && group.memberCount >= group.memberLimit;

  const handleJoinClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (isLoading) return;
    setIsLoading(true);
    setJoinError(null);
    try {
      if (group.joinType === "open" && onJoin) {
        await onJoin(group.id);
      } else if (group.joinType === "approval" && onRequestJoin) {
        await onRequestJoin(group.id);
      }
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : t("errors.fetchFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const renderButton = () => {
    // Already an active member
    if (viewerMembership?.status === "active") {
      return (
        <span className="rounded-md bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          {t("joined")}
        </span>
      );
    }

    // Pending request
    if (viewerMembership?.status === "pending") {
      return (
        <span className="rounded-md bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          {t("pendingRequest")}
        </span>
      );
    }

    // Group is full
    if (isFull) {
      return (
        <span className="rounded-md bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          {t("groupFull")}
        </span>
      );
    }

    // Not a member — show Join or Request to Join
    if (group.joinType === "approval") {
      return (
        <button
          type="button"
          onClick={handleJoinClick}
          disabled={isLoading}
          className="rounded-md border border-primary px-3 py-1 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
        >
          {isLoading ? "..." : t("requestToJoin")}
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={handleJoinClick}
        disabled={isLoading}
        className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {isLoading ? "..." : t("joinButton")}
      </button>
    );
  };

  return (
    <article
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
      data-testid="group-card"
    >
      <Link
        href={`/groups/${group.id}`}
        className="flex flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {/* Banner */}
        <div className="relative h-32 w-full overflow-hidden bg-muted">
          {group.bannerUrl ? (
            <img src={group.bannerUrl} alt={group.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
              <span className="text-2xl font-bold text-primary/40">
                {group.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col gap-1 p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 font-semibold text-foreground">{group.name}</h3>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {t(`visibilityOptions.${visibilityKey}`)}
            </span>
          </div>

          {group.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{group.description}</p>
          )}

          <div className="mt-auto flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              {t("members", { count: group.memberCount })}
            </span>
            {renderButton()}
          </div>
          {joinError && (
            <p className="text-xs text-destructive" role="alert">
              {joinError}
            </p>
          )}
        </div>
      </Link>
    </article>
  );
}
