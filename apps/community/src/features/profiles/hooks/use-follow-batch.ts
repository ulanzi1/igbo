"use client";

import { useQuery } from "@tanstack/react-query";

const MAX_BATCH_SIZE = 50;

/**
 * Batch follow-status hook.
 *
 * Replaces N parallel per-card `GET /api/v1/members/[userId]/follow` requests
 * with batched `GET /api/v1/members/follow-status?userIds=...` requests.
 *
 * Automatically chunks into batches of 50 (server-side limit) and merges results.
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

      // Chunk into batches of MAX_BATCH_SIZE to respect server limit
      const chunks: string[][] = [];
      for (let i = 0; i < sortedIds.length; i += MAX_BATCH_SIZE) {
        chunks.push(sortedIds.slice(i, i + MAX_BATCH_SIZE));
      }

      const results = await Promise.all(
        chunks.map(async (chunk) => {
          const params = new URLSearchParams({ userIds: chunk.join(",") });
          const res = await fetch(`/api/v1/members/follow-status?${params.toString()}`);
          if (!res.ok) throw new Error("Failed to fetch batch follow status");
          const json = (await res.json()) as { data: Record<string, boolean> };
          return json.data;
        }),
      );

      // Merge all chunk results into a single map
      return Object.assign({}, ...results) as Record<string, boolean>;
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
