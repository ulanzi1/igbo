"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { MemberSuggestion } from "@/services/suggestion-service";

export function useMemberSuggestions(limit = 5) {
  const queryClient = useQueryClient();

  const query = useQuery<MemberSuggestion[]>({
    queryKey: ["member-suggestions", limit],
    queryFn: async () => {
      const res = await fetch(`/api/v1/discover/suggestions?limit=${limit}`);
      if (!res.ok) throw new Error("Failed to load suggestions");
      const json = (await res.json()) as { data: { suggestions: MemberSuggestion[] } };
      return json.data.suggestions;
    },
    staleTime: 5 * 60_000, // 5 min client-side stale time (server caches 24h)
  });

  const dismissMutation = useMutation({
    mutationFn: async (dismissedUserId: string) => {
      const res = await fetch(`/api/v1/discover/suggestions/${dismissedUserId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to dismiss suggestion");
    },
    onMutate: async (dismissedUserId) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ["member-suggestions", limit] });
      const previous = queryClient.getQueryData<MemberSuggestion[]>(["member-suggestions", limit]);
      // Optimistically remove dismissed member immediately
      queryClient.setQueryData(
        ["member-suggestions", limit],
        (prev: MemberSuggestion[] | undefined) =>
          prev?.filter((s) => s.member.userId !== dismissedUserId) ?? [],
      );
      return { previous };
    },
    onError: (_err, _dismissedUserId, context) => {
      // Rollback to previous state on failure
      if (context?.previous) {
        queryClient.setQueryData(["member-suggestions", limit], context.previous);
      }
    },
  });

  return {
    suggestions: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    dismiss: dismissMutation.mutate,
  };
}
