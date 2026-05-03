// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRealTimersForReactQuery } from "@/test/vi-patterns";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const USER_A = "00000000-0000-4000-8000-000000000002";
const USER_B = "00000000-0000-4000-8000-000000000003";

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

import { useFollowBatch } from "./use-follow-batch";

describe("useFollowBatch", () => {
  it("returns getIsFollowing that returns false while loading", () => {
    // Don't resolve fetch so we stay in loading state
    mockFetch.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useFollowBatch([USER_A, USER_B]), {
      wrapper: makeWrapper(),
    });

    // Default while loading
    expect(result.current.getIsFollowing(USER_A)).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  it("returns correct follow statuses after data loads", async () => {
    useRealTimersForReactQuery();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { [USER_A]: true, [USER_B]: false } }),
    });

    const { result } = renderHook(() => useFollowBatch([USER_A, USER_B]), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.getIsFollowing(USER_A)).toBe(true);
    expect(result.current.getIsFollowing(USER_B)).toBe(false);
  });

  it("calls the batch endpoint with all userIds joined by comma", async () => {
    useRealTimersForReactQuery();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });

    renderHook(() => useFollowBatch([USER_A, USER_B]), { wrapper: makeWrapper() });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [calledUrl] = mockFetch.mock.calls[0] as [string];
    expect(calledUrl).toContain("/api/v1/members/follow-status");
    expect(calledUrl).toContain("userIds=");
    expect(calledUrl).toContain(USER_A);
    expect(calledUrl).toContain(USER_B);
  });

  it("does not fetch when userIds is empty", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useFollowBatch([]), { wrapper: makeWrapper() });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.getIsFollowing(USER_A)).toBe(false);
  });

  it("getIsFollowing returns false for unknown userId not in the response", async () => {
    useRealTimersForReactQuery();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { [USER_A]: true } }),
    });

    const { result } = renderHook(() => useFollowBatch([USER_A]), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.getIsFollowing("00000000-0000-4000-8000-000000000099")).toBe(false);
  });

  it("chunks userIds into batches of 50 and merges results", async () => {
    useRealTimersForReactQuery();

    // Generate 75 user IDs (should split into 50 + 25)
    const manyIds = Array.from(
      { length: 75 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: Object.fromEntries(manyIds.map((id) => [id, true])) }),
    });

    const { result } = renderHook(() => useFollowBatch(manyIds), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Should have made 2 fetch calls (50 + 25)
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // First call should have 50 IDs
    const [url1] = mockFetch.mock.calls[0] as [string];
    const ids1 = new URL(url1, "http://localhost").searchParams.get("userIds")!.split(",");
    expect(ids1).toHaveLength(50);

    // Second call should have 25 IDs
    const [url2] = mockFetch.mock.calls[1] as [string];
    const ids2 = new URL(url2, "http://localhost").searchParams.get("userIds")!.split(",");
    expect(ids2).toHaveLength(25);

    // Results should be merged
    expect(result.current.getIsFollowing(manyIds[0]!)).toBe(true);
    expect(result.current.getIsFollowing(manyIds[74]!)).toBe(true);
  });

  it("uses a stable sorted query key regardless of userIds order", async () => {
    useRealTimersForReactQuery();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });

    // Two hooks with same userIds in different order — should share the same fetch
    const wrapper = makeWrapper();
    renderHook(() => useFollowBatch([USER_B, USER_A]), { wrapper });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    // URL should have sorted IDs (USER_A < USER_B alphabetically)
    const [calledUrl] = mockFetch.mock.calls[0] as [string];
    const idx_a = calledUrl.indexOf(USER_A);
    const idx_b = calledUrl.indexOf(USER_B);
    expect(idx_a).toBeLessThan(idx_b);
  });
});
