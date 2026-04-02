import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock searchMembers server action before module import
const mockSearchMembers = vi.fn();
vi.mock("@/features/chat/actions/search-members", () => ({
  searchMembers: (...args: unknown[]) => mockSearchMembers(...args),
}));

import { useMemberSearch } from "./use-member-search";

const MEMBER_RESULTS = [
  { id: "user-2", displayName: "Ada Okonkwo", photoUrl: null },
  { id: "user-3", displayName: "Chidi Okeke", photoUrl: null },
];

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchMembers.mockResolvedValue(MEMBER_RESULTS);
});

describe("useMemberSearch", () => {
  it("returns empty results when query is shorter than 2 chars", async () => {
    const { result } = renderHook(() => useMemberSearch("A", []), {
      wrapper: makeWrapper(),
    });
    // Query disabled — no fetch should occur
    await new Promise((r) => setTimeout(r, 50));
    expect(mockSearchMembers).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });

  it("returns empty results for empty query", async () => {
    const { result } = renderHook(() => useMemberSearch("", []), {
      wrapper: makeWrapper(),
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(mockSearchMembers).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });

  it("calls searchMembers when query length >= 2", async () => {
    const { result } = renderHook(() => useMemberSearch("Ada", []), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSearching).toBe(false);
    });

    expect(mockSearchMembers).toHaveBeenCalledWith("Ada", []);
    expect(result.current.results).toEqual(MEMBER_RESULTS);
  });

  it("passes excludeUserIds to searchMembers", async () => {
    const excludeIds = ["user-1", "user-2"];
    renderHook(() => useMemberSearch("Ada", excludeIds), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(mockSearchMembers).toHaveBeenCalledWith("Ada", excludeIds);
    });
  });

  it("returns empty array when searchMembers returns empty", async () => {
    mockSearchMembers.mockResolvedValue([]);
    const { result } = renderHook(() => useMemberSearch("xyz", []), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSearching).toBe(false);
    });

    expect(result.current.results).toEqual([]);
  });
});
