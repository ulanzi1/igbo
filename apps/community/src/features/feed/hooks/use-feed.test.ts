// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRealTimersForReactQuery } from "@/test/vi-patterns";

const MOCK_PAGE_1 = {
  posts: [
    {
      id: "post-1",
      authorId: "user-b",
      authorDisplayName: "Test User",
      authorPhotoUrl: null,
      content: "Hello",
      contentType: "text" as const,
      visibility: "members_only" as const,
      groupId: null,
      isPinned: false,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      media: [],
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-01T10:00:00.000Z",
    },
  ],
  nextCursor: "cursor-abc",
  isColdStart: false,
};

const MOCK_PAGE_2 = {
  posts: [
    {
      id: "post-2",
      authorId: "user-c",
      authorDisplayName: "Other User",
      authorPhotoUrl: null,
      content: "World",
      contentType: "text" as const,
      visibility: "members_only" as const,
      groupId: null,
      isPinned: false,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      media: [],
      createdAt: "2026-03-01T09:00:00.000Z",
      updatedAt: "2026-03-01T09:00:00.000Z",
    },
  ],
  nextCursor: null,
  isColdStart: false,
};

global.fetch = vi.fn();

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: async () => ({ data: MOCK_PAGE_1 }),
  } as Response);
});

import { useFeed } from "./use-feed";

describe("useFeed", () => {
  it("initial fetch calls /api/v1/feed?sort=chronological&filter=all (no cursor)", async () => {
    useRealTimersForReactQuery();
    const { result } = renderHook(() => useFeed({ sort: "chronological", filter: "all" }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    const url = new URL(fetchCall[0]);
    expect(url.pathname).toBe("/api/v1/feed");
    expect(url.searchParams.get("sort")).toBe("chronological");
    expect(url.searchParams.get("filter")).toBe("all");
    expect(url.searchParams.has("cursor")).toBe(false);
  });

  it("returns posts from first page", async () => {
    useRealTimersForReactQuery();
    const { result } = renderHook(() => useFeed({ sort: "chronological", filter: "all" }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const allPosts = result.current.data?.pages.flatMap((p) => p.posts) ?? [];
    expect(allPosts).toHaveLength(1);
    expect(allPosts[0]!.id).toBe("post-1");
  });

  it("hasNextPage is false when nextCursor=null", async () => {
    useRealTimersForReactQuery();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: MOCK_PAGE_2 }), // nextCursor is null
    } as Response);

    const { result } = renderHook(() => useFeed({ sort: "chronological", filter: "all" }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNextPage).toBe(false);
  });

  it("fetchNextPage sends cursor param when hasNextPage=true", async () => {
    useRealTimersForReactQuery();
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    // First page returns cursor-abc; second page returns null cursor
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: MOCK_PAGE_1 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: MOCK_PAGE_2 }),
      } as Response);

    const { result } = renderHook(() => useFeed({ sort: "chronological", filter: "all" }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNextPage).toBe(true);

    // Trigger fetchNextPage
    void result.current.fetchNextPage();

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

    const secondCall = mockFetch.mock.calls[1] as [string];
    const url = new URL(secondCall[0]);
    expect(url.searchParams.get("cursor")).toBe("cursor-abc");
  });

  it("re-fetches when sort changes", async () => {
    useRealTimersForReactQuery();
    let sort = "chronological" as "chronological" | "algorithmic";
    const { result, rerender } = renderHook(() => useFeed({ sort, filter: "all" }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const initialCallCount = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    sort = "algorithmic";
    rerender();

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBeGreaterThan(initialCallCount);
      const lastCall = calls[calls.length - 1] as [string];
      const url = new URL(lastCall[0]);
      expect(url.searchParams.get("sort")).toBe("algorithmic");
    });
  });
});
