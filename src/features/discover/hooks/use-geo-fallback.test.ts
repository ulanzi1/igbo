// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRealTimersForReactQuery } from "@/test/vi-patterns";

import { useGeoFallback } from "./use-geo-fallback";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const MOCK_RESULT = {
  members: [],
  hasMore: false,
  nextCursor: null,
  activeLevel: "city" as const,
  levelCounts: { city: 10, state: 25, country: 50, global: 200 },
  activeLocationLabel: "Houston",
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
    json: async () => ({ data: MOCK_RESULT }),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useGeoFallback", () => {
  it("returns activeLevel, levelCounts, members from API response", async () => {
    useRealTimersForReactQuery();

    const { result } = renderHook(
      () => useGeoFallback({ city: "Houston", state: "Texas", country: "United States" }),
      {
        wrapper: makeWrapper(),
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.activeLevel).toBe("city");
    expect(result.current.data?.levelCounts.city).toBe(10);
    expect(result.current.data?.activeLocationLabel).toBe("Houston");
    expect(result.current.data?.members).toEqual([]);
  });

  it("query is disabled when no location params provided", () => {
    const { result } = renderHook(() => useGeoFallback({}), {
      wrapper: makeWrapper(),
    });

    // fetchStatus should be 'idle' (not fetching) when disabled
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("builds correct URL from city/state/country params", async () => {
    useRealTimersForReactQuery();

    renderHook(() => useGeoFallback({ city: "Houston", state: "Texas", country: "USA" }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    const url = mockFetch.mock.calls[0]?.[0] as string;
    expect(url).toContain("city=Houston");
    expect(url).toContain("state=Texas");
    expect(url).toContain("country=USA");
  });

  it("returns error state when fetch fails", async () => {
    useRealTimersForReactQuery();

    mockFetch.mockResolvedValue({ ok: false });

    const { result } = renderHook(() => useGeoFallback({ city: "Houston" }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
