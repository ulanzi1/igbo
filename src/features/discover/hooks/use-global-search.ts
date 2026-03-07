"use client";

import { useQuery } from "@tanstack/react-query";
import { useDeferredValue } from "react";

export interface SearchResultItem {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  href: string;
  rank: number;
}

export interface SearchSection {
  type: string;
  items: SearchResultItem[];
  hasMore: boolean;
}

export interface GlobalSearchResponse {
  query: string;
  sections: SearchSection[];
  pageInfo: {
    query: string;
    limit: number;
    hasNextPage: boolean;
    cursor: string | null;
  };
}

const MIN_QUERY_LENGTH = 3;

export function useGlobalSearch(query: string) {
  // Debounce via React's useDeferredValue — pairs with a 200ms staleTime to avoid
  // redundant fetches when the user types quickly.
  const deferredQuery = useDeferredValue(query);
  const enabled = deferredQuery.trim().length >= MIN_QUERY_LENGTH;

  const result = useQuery<GlobalSearchResponse, Error>({
    queryKey: ["global-search", deferredQuery.trim()],
    queryFn: async () => {
      const params = new URLSearchParams({ q: deferredQuery.trim(), limit: "5" });
      const res = await fetch(`/api/v1/search?${params.toString()}`);
      if (!res.ok) throw new Error("Search request failed");
      const json = (await res.json()) as { data: GlobalSearchResponse };
      return json.data;
    },
    enabled,
    staleTime: 30_000, // 30 s — search results tolerate short staleness
    gcTime: 60_000,
  });

  return {
    ...result,
    isDeferred: deferredQuery !== query,
    enabled,
  };
}
