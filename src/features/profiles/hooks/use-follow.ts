"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useFollow(targetUserId: string) {
  const queryClient = useQueryClient();

  const statusQuery = useQuery<{ isFollowing: boolean }>({
    queryKey: ["follow-status", targetUserId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/members/${targetUserId}/follow`);
      if (!res.ok) throw new Error("Failed to get follow status");
      const json = (await res.json()) as { data: { isFollowing: boolean } };
      return json.data;
    },
    staleTime: 60_000, // 1 min — status can be slightly stale
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/members/${targetUserId}/follow`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to follow member");
    },
    onMutate: async () => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ["follow-status", targetUserId] });
      const previous = queryClient.getQueryData<{ isFollowing: boolean }>([
        "follow-status",
        targetUserId,
      ]);
      queryClient.setQueryData(["follow-status", targetUserId], { isFollowing: true });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previous !== undefined) {
        queryClient.setQueryData(["follow-status", targetUserId], context.previous);
      }
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/members/${targetUserId}/follow`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to unfollow member");
    },
    onMutate: async () => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ["follow-status", targetUserId] });
      const previous = queryClient.getQueryData<{ isFollowing: boolean }>([
        "follow-status",
        targetUserId,
      ]);
      queryClient.setQueryData(["follow-status", targetUserId], { isFollowing: false });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(["follow-status", targetUserId], context.previous);
      }
    },
  });

  const isFollowing = statusQuery.data?.isFollowing ?? false;

  return {
    isFollowing,
    isLoading: statusQuery.isLoading,
    follow: followMutation.mutate,
    unfollow: unfollowMutation.mutate,
    isPending: followMutation.isPending || unfollowMutation.isPending,
  };
}
