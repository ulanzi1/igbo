// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRealTimersForReactQuery } from "@/test/vi-patterns";

import type { DiscoverFilters } from "../types";
import { DEFAULT_FILTERS } from "../types";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const MOCK_PAGE_1 = {
  members: [
    {
      userId: "00000000-0000-4000-8000-000000000002",
      displayName: "Alice",
      bio: "Community member",
      photoUrl: null,
      locationCity: "Lagos",
      locationState: null,
      locationCountry: "Nigeria",
      interests: ["music"],
      languages: ["Igbo"],
      membershipTier: "BASIC" as const,
    },
  ],
  hasMore: true,
  nextCursor: "cursor-page-2",
};

const MOCK_PAGE_2 = {
  members: [
    {
      userId: "00000000-0000-4000-8000-000000000003",
      displayName: "Bob",
      bio: null,
      photoUrl: null,
      locationCity: null,
      locationState: null,
      locationCountry: null,
      interests: [],
      languages: ["English"],
      membershipTier: "PROFESSIONAL" as const,
    },
  ],
  hasMore: false,
  nextCursor: null,
};

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
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ data: MOCK_PAGE_1 }),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

import { useDiscover } from "./use-discover";

describe("useDiscover", () => {
  it("fetches first page on mount", async () => {
    useRealTimersForReactQuery();

    const { result } = renderHook(() => useDiscover(DEFAULT_FILTERS), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/api/v1/discover"));
    const members = result.current.data?.pages.flatMap((p) => p.members) ?? [];
    expect(members).toHaveLength(1);
    expect(members[0]?.displayName).toBe("Alice");
  });

  it("getNextPageParam returns next cursor when hasMore is true", async () => {
    useRealTimersForReactQuery();

    const { result } = renderHook(() => useDiscover(DEFAULT_FILTERS), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // hasNextPage should be true when nextCursor is present
    expect(result.current.hasNextPage).toBe(true);
  });

  it("getNextPageParam returns undefined when hasMore is false", async () => {
    useRealTimersForReactQuery();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: MOCK_PAGE_2 }),
    });

    const { result } = renderHook(() => useDiscover(DEFAULT_FILTERS), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.hasNextPage).toBe(false);
  });

  it("query key changes when filters change triggering new fetch", async () => {
    useRealTimersForReactQuery();

    const filters1: DiscoverFilters = { ...DEFAULT_FILTERS, query: "Alice" };
    const filters2: DiscoverFilters = { ...DEFAULT_FILTERS, query: "Bob" };

    let currentFilters = filters1;

    const { result, rerender } = renderHook(() => useDiscover(currentFilters), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const firstCallCount = mockFetch.mock.calls.length;

    currentFilters = filters2;
    rerender();

    await waitFor(() => expect(mockFetch.mock.calls.length).toBeGreaterThan(firstCallCount));

    // The second fetch should include the new query
    const lastCall = (mockFetch.mock.calls[mockFetch.mock.calls.length - 1]?.[0] ?? "") as string;
    expect(lastCall).toContain("q=Bob");
  });
});
