"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { FeedSortMode, FeedFilter } from "@igbo/config/feed";
import type { FeedPage } from "@/features/feed/types";

interface UseFeedOptions {
  sort: FeedSortMode;
  filter: FeedFilter;
}

export function useFeed({ sort, filter }: UseFeedOptions) {
  return useInfiniteQuery<FeedPage, Error, { pages: FeedPage[] }, string[], string | null>({
    queryKey: ["feed", sort, filter],
    queryFn: async ({ pageParam }) => {
      const url = new URL("/api/v1/feed", window.location.origin);
      url.searchParams.set("sort", sort);
      url.searchParams.set("filter", filter);
      if (pageParam) url.searchParams.set("cursor", pageParam);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch feed");
      const json = (await res.json()) as { data: FeedPage };
      return json.data;
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000, // 30s — feed is semi-real-time
  });
}
