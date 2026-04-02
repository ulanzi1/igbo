"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useReducer, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FollowButton } from "./FollowButton";
import type { FollowListMember } from "@igbo/db/queries/follows";

interface FollowListProps {
  userId: string; // Whose followers/following to load
  type: "followers" | "following";
  viewerUserId: string; // Logged-in viewer — to hide FollowButton on own entries
}

function membersReducer(
  state: FollowListMember[],
  action: { type: "replace" | "append"; members: FollowListMember[] },
): FollowListMember[] {
  if (action.type === "append") return [...state, ...action.members];
  return action.members;
}

export function FollowList({ userId, type, viewerUserId }: FollowListProps) {
  const t = useTranslations("Profile");
  const [cursor, setCursor] = useState<string | null>(null);
  const [allMembers, dispatch] = useReducer(membersReducer, []);
  // Ref tracks whether the current page is a "load more" (cursor != null) to determine
  // whether to append or replace allMembers
  const isLoadMoreRef = useRef(false);

  const { data, isLoading, isFetching } = useQuery<{
    members: FollowListMember[];
    nextCursor: string | null;
  }>({
    queryKey: ["follow-list", userId, type, cursor],
    queryFn: async () => {
      const url = new URL(`/api/v1/members/${userId}/${type}`, window.location.origin);
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load list");
      const json = (await res.json()) as {
        data: { members: FollowListMember[]; nextCursor: string | null };
      };
      return json.data;
    },
  });

  // React Query v5 removed onSuccess from useQuery — use useEffect instead.
  // dispatch (from useReducer) is used instead of setState to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!data) return;
    dispatch({ type: isLoadMoreRef.current ? "append" : "replace", members: data.members });
    isLoadMoreRef.current = false;
  }, [data]);

  const handleLoadMore = () => {
    if (data?.nextCursor) {
      isLoadMoreRef.current = true;
      setCursor(data.nextCursor);
    }
  };

  if (isLoading && allMembers.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{t("followListLoading")}</p>;
  }

  if (!isLoading && allMembers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        {type === "followers" ? t("noFollowers") : t("noFollowing")}
      </p>
    );
  }

  return (
    <div>
      <ul className="divide-y">
        {allMembers.map((member) => {
          const initials = member.displayName
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
          const location = [member.locationCity, member.locationCountry].filter(Boolean).join(", ");

          return (
            <li key={member.userId} className="flex items-center gap-3 py-3">
              <Link
                href={`/profiles/${member.userId}`}
                className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80"
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={member.photoUrl ?? undefined} alt={member.displayName} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member.displayName}</p>
                  {location && <p className="truncate text-xs text-muted-foreground">{location}</p>}
                </div>
              </Link>
              {member.userId !== viewerUserId && (
                <FollowButton
                  targetUserId={member.userId}
                  targetName={member.displayName}
                  size="sm"
                />
              )}
            </li>
          );
        })}
      </ul>
      {data?.nextCursor && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleLoadMore}
          disabled={isFetching}
          className="mt-3 w-full"
        >
          {isFetching ? t("followListLoading") : t("followListLoadMore")}
        </Button>
      )}
    </div>
  );
}
