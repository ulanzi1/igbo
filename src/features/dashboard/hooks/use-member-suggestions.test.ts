// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRealTimersForReactQuery } from "@/test/vi-patterns";

vi.mock("@/services/suggestion-service", () => ({}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

const USER_B = "00000000-0000-4000-8000-000000000002";
const USER_C = "00000000-0000-4000-8000-000000000003";

const MOCK_SUGGESTIONS = [
  {
    member: {
      userId: USER_B,
      displayName: "Alice",
      photoUrl: null,
      locationCity: "Houston",
      locationState: "Texas",
      locationCountry: "United States",
      interests: [],
      languages: [],
      membershipTier: "BASIC" as const,
      bio: null,
    },
    reasonType: "city" as const,
    reasonValue: "Houston",
  },
  {
    member: {
      userId: USER_C,
      displayName: "Bob",
      photoUrl: null,
      locationCity: null,
      locationState: null,
      locationCountry: null,
      interests: [],
      languages: [],
      membershipTier: "BASIC" as const,
      bio: null,
    },
    reasonType: "community" as const,
    reasonValue: "",
  },
];

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
    json: async () => ({ data: { suggestions: MOCK_SUGGESTIONS } }),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

import { useMemberSuggestions } from "./use-member-suggestions";

describe("useMemberSuggestions", () => {
  it("returns suggestions array from successful API response", async () => {
    useRealTimersForReactQuery();
    const { result } = renderHook(() => useMemberSuggestions(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.suggestions).toHaveLength(2);
    expect(result.current.suggestions[0].member.userId).toBe(USER_B);
  });

  it("isLoading is true during pending state", () => {
    // Don't call useRealTimers — we want to check initial loading state synchronously
    mockFetch.mockImplementation(() => new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useMemberSuggestions(), { wrapper: makeWrapper() });
    expect(result.current.isLoading).toBe(true);
  });

  it("isError is true on fetch failure", async () => {
    useRealTimersForReactQuery();
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });

    const { result } = renderHook(() => useMemberSuggestions(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("dismiss calls DELETE endpoint with correct userId", async () => {
    useRealTimersForReactQuery();
    // Mock the dismiss fetch (second call)
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { suggestions: MOCK_SUGGESTIONS } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { dismissed: true } }) });

    const { result } = renderHook(() => useMemberSuggestions(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.dismiss(USER_B);
    });

    // Verify DELETE was called
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/v1/discover/suggestions/${USER_B}`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("after dismiss succeeds, dismissed suggestion is removed from suggestions array", async () => {
    useRealTimersForReactQuery();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { suggestions: MOCK_SUGGESTIONS } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { dismissed: true } }) });

    const { result } = renderHook(() => useMemberSuggestions(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.suggestions).toHaveLength(2));

    await act(async () => {
      result.current.dismiss(USER_B);
    });

    // After optimistic update, USER_B should be removed
    await waitFor(() =>
      expect(result.current.suggestions.find((s) => s.member.userId === USER_B)).toBeUndefined(),
    );
    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.suggestions[0].member.userId).toBe(USER_C);
  });
});
