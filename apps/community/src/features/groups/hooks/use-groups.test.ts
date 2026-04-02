// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useGroups } from "./use-groups";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockGroupsResponse = {
  data: {
    groups: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: "London Chapter",
        description: null,
        bannerUrl: null,
        visibility: "public",
        joinType: "open",
        memberCount: 10,
        creatorId: "00000000-0000-4000-8000-000000000002",
        createdAt: "2026-03-01T10:00:00.000Z",
      },
    ],
    nextCursor: null,
    total: 1,
  },
};

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return Wrapper;
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockGroupsResponse),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useGroups", () => {
  it("fetches groups and returns data", async () => {
    const { result } = renderHook(() => useGroups(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.groups).toHaveLength(1);
    expect(result.current.data?.groups[0]?.name).toBe("London Chapter");
  });

  it("calls correct URL with nameFilter param", async () => {
    const { result } = renderHook(() => useGroups({ nameFilter: "London" }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("name=London"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("calls correct URL with cursor param", async () => {
    const cursor = "2026-03-01T10:00:00.000Z";
    const { result } = renderHook(() => useGroups({ cursor }), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`cursor=${encodeURIComponent(cursor)}`),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("returns isError when fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useGroups(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("returns isLoading initially", () => {
    // Don't resolve the fetch
    mockFetch.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useGroups(), { wrapper: makeWrapper() });

    expect(result.current.isLoading).toBe(true);
  });
});
