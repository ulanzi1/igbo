"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * Batch follow-status hook.
 *
 * Replaces N parallel per-card `GET /api/v1/members/[userId]/follow` requests
 * with a single `GET /api/v1/members/follow-status?userIds=...` request per page load.
 *
 * Usage (e.g. in MemberGrid):
 * ```tsx
 * const { getIsFollowing } = useFollowBatch(members.map(m => m.userId));
 * // Then per card:
 * const isFollowing = getIsFollowing(member.userId);
 * ```
 *
 * Returns `false` for any userId not yet loaded (safe default — prevents flash of wrong state).
 * Stale time: 60 seconds (same as per-card useFollow, status can be slightly stale).
 */
export function useFollowBatch(userIds: string[]) {
  const sortedIds = [...userIds].sort(); // stable key regardless of render order

  const query = useQuery<Record<string, boolean>>({
    queryKey: ["follow-status-batch", sortedIds],
    queryFn: async () => {
      if (sortedIds.length === 0) return {};
      const params = new URLSearchParams({ userIds: sortedIds.join(",") });
      const res = await fetch(`/api/v1/members/follow-status?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch batch follow status");
      const json = (await res.json()) as { data: Record<string, boolean> };
      return json.data;
    },
    staleTime: 60_000,
    enabled: sortedIds.length > 0,
  });

  function getIsFollowing(userId: string): boolean {
    return query.data?.[userId] ?? false;
  }

  return {
    getIsFollowing,
    isLoading: query.isLoading,
  };
}
