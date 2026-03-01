// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRealTimersForReactQuery } from "@/test/vi-patterns";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const TARGET_ID = "00000000-0000-4000-8000-000000000002";

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

afterEach(() => {
  vi.useRealTimers();
});

import { useFollow } from "./use-follow";

describe("useFollow", () => {
  it("isFollowing is false by default (status query returns { isFollowing: false })", async () => {
    useRealTimersForReactQuery();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { isFollowing: false } }),
    });

    const { result } = renderHook(() => useFollow(TARGET_ID), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isFollowing).toBe(false);
  });

  it("isFollowing is true when API returns { isFollowing: true }", async () => {
    useRealTimersForReactQuery();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { isFollowing: true } }),
    });

    const { result } = renderHook(() => useFollow(TARGET_ID), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isFollowing).toBe(true));
  });

  it("follow() sends POST to correct URL", async () => {
    useRealTimersForReactQuery();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { isFollowing: false } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useFollow(TARGET_ID), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.follow();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/v1/members/${TARGET_ID}/follow`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("unfollow() sends DELETE to correct URL", async () => {
    useRealTimersForReactQuery();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { isFollowing: true } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useFollow(TARGET_ID), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.unfollow();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/v1/members/${TARGET_ID}/follow`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("optimistic update: isFollowing becomes true immediately on follow()", async () => {
    useRealTimersForReactQuery();
    // Status query returns false, follow POST hangs (deferred)
    let resolvePost!: (v: unknown) => void;
    const postPromise = new Promise((res) => {
      resolvePost = res;
    });

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { isFollowing: false } }),
      })
      .mockReturnValueOnce(postPromise);

    const { result } = renderHook(() => useFollow(TARGET_ID), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isFollowing).toBe(false);

    act(() => {
      result.current.follow();
    });

    // Optimistic update should apply immediately
    await waitFor(() => expect(result.current.isFollowing).toBe(true));

    // Resolve the POST
    resolvePost({ ok: true, json: async () => ({}) });
  });

  it("rollback: isFollowing reverts on follow() error", async () => {
    useRealTimersForReactQuery();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { isFollowing: false } }),
      })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    const { result } = renderHook(() => useFollow(TARGET_ID), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.follow();
    });

    // After error, should roll back to false
    await waitFor(() => expect(result.current.isFollowing).toBe(false));
  });

  it("isPending is true during mutation", async () => {
    useRealTimersForReactQuery();
    let resolvePost!: (v: unknown) => void;
    const postPromise = new Promise((res) => {
      resolvePost = res;
    });

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { isFollowing: false } }),
      })
      .mockReturnValueOnce(postPromise);

    const { result } = renderHook(() => useFollow(TARGET_ID), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.follow();
    });

    // isPending should be true while mutation is in flight
    await waitFor(() => expect(result.current.isPending).toBe(true));

    resolvePost({ ok: true, json: async () => ({}) });
  });
});
