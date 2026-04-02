"use client";

import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useDeferredValue } from "react";
import type { SearchFilters } from "@igbo/db/queries/search";

export interface SearchResultItem {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  href: string;
  rank: number;
  highlight?: string | null;
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
    nextCursor: string | null;
  };
}

export type { SearchFilters };

const MIN_QUERY_LENGTH = 3;

/** Overview mode: no type filter → useQuery, grouped sections */
export function useGlobalSearch(query: string) {
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
    staleTime: 30_000,
    gcTime: 60_000,
  });

  return {
    ...result,
    isDeferred: deferredQuery !== query,
    enabled,
  };
}

export interface FilteredSearchParams {
  query: string;
  type: string;
  filters?: SearchFilters;
  limit?: number;
}

/** Filtered mode: specific type → useInfiniteQuery with cursor pagination */
export function useFilteredSearch({ query, type, filters, limit = 10 }: FilteredSearchParams) {
  const deferredQuery = useDeferredValue(query);
  const enabled = deferredQuery.trim().length >= MIN_QUERY_LENGTH && !!type && type !== "all";

  const result = useInfiniteQuery<GlobalSearchResponse, Error>({
    queryKey: ["filtered-search", deferredQuery.trim(), type, filters, limit],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        q: deferredQuery.trim(),
        type,
        limit: String(limit),
      });
      if (pageParam && typeof pageParam === "string") {
        params.set("cursor", pageParam);
      }
      // Append filter params
      if (filters) {
        if (filters.dateRange) params.set("dateRange", filters.dateRange);
        if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
        if (filters.dateTo) params.set("dateTo", filters.dateTo);
        if (filters.authorId) params.set("authorId", filters.authorId);
        if (filters.category) params.set("category", filters.category);
        if (filters.location) params.set("location", filters.location);
        if (filters.membershipTier) params.set("membershipTier", filters.membershipTier);
      }
      const res = await fetch(`/api/v1/search?${params.toString()}`);
      if (!res.ok) throw new Error("Search request failed");
      const json = (await res.json()) as { data: GlobalSearchResponse };
      return json.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor ?? undefined,
    enabled,
    staleTime: 30_000,
    gcTime: 60_000,
  });

  // Flatten pages into one combined items list
  const allItems: SearchResultItem[] =
    result.data?.pages.flatMap((page) => page.sections.flatMap((s) => s.items)) ?? [];

  return {
    ...result,
    allItems,
    isDeferred: deferredQuery !== query,
    enabled,
  };
}
