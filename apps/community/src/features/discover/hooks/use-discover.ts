"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { DiscoverFilters } from "../types";
import type { MemberCardData } from "@/services/geo-search";

function buildDiscoverUrl(filters: DiscoverFilters, cursor?: string): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.locationCity) params.set("city", filters.locationCity);
  if (filters.locationState) params.set("state", filters.locationState);
  if (filters.locationCountry) params.set("country", filters.locationCountry);
  filters.interests.forEach((i) => params.append("interests", i));
  if (filters.language) params.set("language", filters.language);
  if (filters.membershipTier) params.set("tier", filters.membershipTier);
  if (cursor) params.set("cursor", cursor);
  return `/api/v1/discover?${params.toString()}`;
}

export function useDiscover(filters: DiscoverFilters) {
  return useInfiniteQuery<
    { members: MemberCardData[]; hasMore: boolean; nextCursor: string | null },
    Error,
    { pages: Array<{ members: MemberCardData[]; hasMore: boolean; nextCursor: string | null }> },
    (string | string[])[],
    string | undefined
  >({
    queryKey: [
      "discover",
      filters.query,
      filters.locationCity,
      filters.locationState,
      filters.locationCountry,
      filters.interests,
      filters.language,
      filters.membershipTier,
    ],
    queryFn: async ({ pageParam }) => {
      const url = buildDiscoverUrl(filters, pageParam);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load members");
      const json = (await res.json()) as {
        data: { members: MemberCardData[]; hasMore: boolean; nextCursor: string | null };
      };
      return json.data;
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 60_000, // 1 minute — directory is read-heavy, tolerate slight staleness
  });
}
