"use client";

import { useTranslations } from "next-intl";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GroupMemberRole } from "@/db/schema/community-groups";

interface GroupMemberItem {
  userId: string;
  displayName: string;
  photoUrl: string | null;
  role: "member" | "leader" | "creator";
  joinedAt: string;
  mutedUntil: string | null;
}

interface PageData {
  members: GroupMemberItem[];
  nextCursor: string | null;
}

interface GroupMembersTabProps {
  groupId: string;
  viewerRole: GroupMemberRole | null;
  viewerId: string;
}

export function GroupMembersTab({ groupId, viewerRole, viewerId }: GroupMembersTabProps) {
  const t = useTranslations("Groups");
  const queryClient = useQueryClient();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery<PageData>({
    queryKey: ["group-members", groupId],
    queryFn: async ({ pageParam }) => {
      const url = new URL(`/api/v1/groups/${groupId}/members`, window.location.origin);
      if (pageParam) url.searchParams.set("cursor", pageParam as string);
      url.searchParams.set("limit", "50");
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch members");
      const json = (await res.json()) as { data: PageData };
      return json.data;
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const members = data?.pages.flatMap((p) => p.members) ?? [];

  const isCreator = viewerRole === "creator";
  const isLeaderOrCreator = viewerRole === "leader" || viewerRole === "creator";

  const roleLabel = (role: GroupMemberItem["role"]) => {
    if (role === "creator") return t("members.role.creator");
    if (role === "leader") return t("members.role.leader");
    return t("members.role.member");
  };

  const invalidateMembers = () => {
    void queryClient.invalidateQueries({ queryKey: ["group-members", groupId] });
  };

  const handlePromote = async (userId: string) => {
    setActionLoading(`promote-${userId}`);
    try {
      await fetch(`/api/v1/groups/${groupId}/members/${userId}/promote`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      invalidateMembers();
    } finally {
      setActionLoading(null);
    }
  };

  const handleMute = async (userId: string) => {
    setActionLoading(`mute-${userId}`);
    try {
      await fetch(`/api/v1/groups/${groupId}/members/${userId}/mute`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationHours: 24 }),
      });
      invalidateMembers();
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnmute = async (userId: string) => {
    setActionLoading(`unmute-${userId}`);
    try {
      await fetch(`/api/v1/groups/${groupId}/members/${userId}/unmute`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      invalidateMembers();
    } finally {
      setActionLoading(null);
    }
  };

  const handleBan = async (userId: string) => {
    setActionLoading(`ban-${userId}`);
    try {
      await fetch(`/api/v1/groups/${groupId}/members/${userId}/ban`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      invalidateMembers();
    } finally {
      setActionLoading(null);
    }
  };

  if (members.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        {t("members.noMembers")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {members.map((member) => {
        const initials = member.displayName
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2);

        const isSelf = member.userId === viewerId;
        const canModerate = isLeaderOrCreator && !isSelf && member.role !== "creator";
        const canPromote = isCreator && member.role === "member";
        const isMuted = !!member.mutedUntil && new Date(member.mutedUntil) > new Date();

        return (
          <div
            key={member.userId}
            className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
          >
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarImage src={member.photoUrl ?? undefined} alt={member.displayName} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{member.displayName}</p>
              <p className="text-xs text-muted-foreground">
                {t("members.joinedDate", { date: new Date(member.joinedAt).toLocaleDateString() })}
              </p>
            </div>
            {member.role !== "member" && (
              <Badge variant="secondary" className="shrink-0 text-xs">
                {roleLabel(member.role)}
              </Badge>
            )}
            {canPromote && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 text-xs"
                disabled={actionLoading === `promote-${member.userId}`}
                onClick={() => void handlePromote(member.userId)}
              >
                {t("members.promoteLeader")}
              </Button>
            )}
            {canModerate && (
              <div className="flex gap-1 shrink-0">
                {isMuted ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs rounded-full bg-amber-100 text-amber-700 ring-2 ring-amber-400 hover:bg-amber-200 hover:text-amber-800"
                    disabled={!!actionLoading}
                    onClick={() => void handleUnmute(member.userId)}
                  >
                    {t("members.unmute")}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-amber-600 hover:text-amber-700"
                    disabled={!!actionLoading}
                    onClick={() => void handleMute(member.userId)}
                  >
                    {t("members.mute")}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-destructive hover:text-destructive"
                  disabled={!!actionLoading}
                  onClick={() => void handleBan(member.userId)}
                >
                  {t("members.ban")}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm hover:bg-accent transition-colors min-h-[36px]"
          >
            {isFetchingNextPage ? t("feed.loading") : t("feed.loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
