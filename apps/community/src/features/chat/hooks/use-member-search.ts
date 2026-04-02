"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchMembers } from "@/features/chat/actions/search-members";

export interface MemberSearchResult {
  id: string;
  displayName: string;
  photoUrl: string | null;
}

/**
 * Debounced member search hook.
 * Calls the searchMembers Server Action with a true 300ms debounce.
 * Accepts excludeUserIds (already-selected members + self) to filter results.
 * Only queries when debounced query.length >= 2.
 */
export function useMemberSearch(query: string, excludeUserIds: string[]) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ["member-search", debouncedQuery, JSON.stringify(excludeUserIds)],
    queryFn: () => searchMembers(debouncedQuery, excludeUserIds),
    enabled: debouncedQuery.trim().length >= 2,
    placeholderData: [],
  });

  return {
    results: (data ?? []) as MemberSearchResult[],
    isSearching: isFetching,
  };
}
