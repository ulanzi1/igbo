// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const MOCK_RESULTS = [
  {
    messageId: "00000000-0000-4000-8000-000000000010",
    conversationId: "00000000-0000-4000-8000-000000000020",
    senderId: "00000000-0000-4000-8000-000000000002",
    senderDisplayName: "Alice",
    senderPhotoUrl: null,
    content: "Hello igbo",
    snippet: "Hello <mark>igbo</mark>",
    contentType: "text",
    createdAt: new Date("2026-02-01"),
    conversationType: "direct" as const,
    conversationName: "Alice",
  },
];

const mockFetch = vi.fn();
global.fetch = mockFetch;

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
  vi.useFakeTimers();
  mockFetch.mockResolvedValue({
    ok: true,
    // Hook returns res.json() directly, typed as { results: MessageSearchResult[] }
    json: async () => ({ results: MOCK_RESULTS }),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

import { useMessageSearch } from "./use-message-search";

describe("useMessageSearch", () => {
  it("returns empty results when query is less than 3 chars (no fetch)", async () => {
    const { result } = renderHook(() => useMessageSearch(), { wrapper: makeWrapper() });

    act(() => {
      result.current.updateQuery("ab");
    });

    // Advance debounce timer
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current.hasQuery).toBe(false);
    expect(result.current.results).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not fetch before debounce delay", async () => {
    const { result } = renderHook(() => useMessageSearch(), { wrapper: makeWrapper() });

    act(() => {
      result.current.updateQuery("igbo");
    });

    // Before 300ms
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches after debounce delay with query >= 3 chars", async () => {
    const { result } = renderHook(() => useMessageSearch(), { wrapper: makeWrapper() });

    act(() => {
      result.current.updateQuery("igbo");
    });

    // Advance past debounce and flush all pending timers + promises
    await act(async () => {
      vi.advanceTimersByTime(400);
      await vi.runAllTimersAsync();
    });

    expect(result.current.hasQuery).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/conversations/search?q=igbo"),
    );
  });

  it("returns results from API on success", async () => {
    // Switch to real timers: act() doesn't track React Query's async queryFn resolution,
    // so we need waitFor to poll for the state update. waitFor uses setInterval which
    // must be real (not faked) to work.
    vi.useRealTimers();

    const { result } = renderHook(() => useMessageSearch(), { wrapper: makeWrapper() });

    act(() => {
      result.current.updateQuery("igbo");
    });

    // waitFor polls until debounce (300ms) fires, fetch resolves, and React Query updates state
    await waitFor(
      () => {
        expect(result.current.results).toHaveLength(1);
      },
      { timeout: 2000 },
    );
    expect(result.current.results[0]?.senderDisplayName).toBe("Alice");
  });

  it("query state reflects typed value immediately (before debounce)", async () => {
    const { result } = renderHook(() => useMessageSearch(), { wrapper: makeWrapper() });

    act(() => {
      result.current.updateQuery("test");
    });

    expect(result.current.query).toBe("test");
    // But debouncedQuery hasn't fired yet so hasQuery depends on debouncedQuery
    expect(result.current.hasQuery).toBe(false);
  });
});
