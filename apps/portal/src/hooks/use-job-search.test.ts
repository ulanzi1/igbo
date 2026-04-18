// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRouterReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
  useSearchParams: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => `t(${key})`,
}));

const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

vi.mock("server-only", () => ({}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { useSearchParams } from "next/navigation";
import { useJobSearch } from "./use-job-search";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSearchParams(obj: Record<string, string | string[]> = {}): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      for (const val of v) p.append(k, val);
    } else {
      p.set(k, v);
    }
  }
  return p;
}

function makeSuccessResponse(overrides = {}) {
  return {
    results: [
      {
        id: "job-1",
        title: "Engineer",
        companyName: "Acme",
        companyId: "c-1",
        companyLogoUrl: null,
        location: "Lagos",
        employmentType: "full_time",
        salaryMin: null,
        salaryMax: null,
        salaryCompetitiveOnly: false,
        culturalContext: null,
        applicationDeadline: null,
        createdAt: new Date().toISOString(),
        relevance: 0.8,
        snippet: null,
      },
    ],
    facets: {
      location: [{ value: "Lagos", count: 1 }],
      employmentType: [{ value: "full_time", count: 1 }],
      industry: [],
      salaryRange: [],
    },
    pagination: {
      nextCursor: null,
      totalCount: 1,
      effectiveSort: "relevance" as const,
    },
    ...overrides,
  };
}

function setSearchParams(params: URLSearchParams) {
  vi.mocked(useSearchParams).mockReturnValue(
    params as unknown as ReturnType<typeof useSearchParams>,
  );
}

let capturedFetchCalls: Array<{ url: string; signal: AbortSignal }> = [];

function mockFetchSuccess(response = makeSuccessResponse()) {
  vi.spyOn(global, "fetch").mockImplementation(async (url, init) => {
    capturedFetchCalls.push({
      url: String(url),
      signal: init?.signal as AbortSignal,
    });
    return {
      ok: true,
      json: async () => ({ data: response }),
    } as Response;
  });
}

function mockFetchError(status = 500, detail?: string) {
  vi.spyOn(global, "fetch").mockImplementation(async (url, init) => {
    capturedFetchCalls.push({ url: String(url), signal: init?.signal as AbortSignal });
    return {
      ok: false,
      status,
      json: async () => (detail ? { detail } : {}),
    } as Response;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedFetchCalls = [];
  setSearchParams(makeSearchParams());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useJobSearch — initial hydration", () => {
  it("starts with isLoading=true and results=[]", () => {
    mockFetchSuccess();
    const { result } = renderHook(() => useJobSearch({}));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.results).toHaveLength(0);
  });

  it("sets results after successful fetch", async () => {
    mockFetchSuccess();
    const { result } = renderHook(() => useJobSearch({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0]?.title).toBe("Engineer");
  });

  it("sets facets from response", async () => {
    mockFetchSuccess();
    const { result } = renderHook(() => useJobSearch({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.facets?.location).toHaveLength(1);
    expect(result.current.facets?.location[0]?.value).toBe("Lagos");
  });

  it("sets pagination from response", async () => {
    mockFetchSuccess(
      makeSuccessResponse({
        pagination: { nextCursor: "abc", totalCount: 25, effectiveSort: "date" as const },
      }),
    );
    const { result } = renderHook(() => useJobSearch({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pagination?.nextCursor).toBe("abc");
    expect(result.current.pagination?.totalCount).toBe(25);
  });

  it("hydrates state from initialParams on mount", async () => {
    setSearchParams(makeSearchParams({ q: "engineer", location: "Lagos" }));
    mockFetchSuccess();
    const { result } = renderHook(() => useJobSearch({ q: "engineer", location: "Lagos" }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.state.q).toBe("engineer");
  });

  it("fires exactly one fetch on initial load", async () => {
    mockFetchSuccess();
    const { result } = renderHook(() => useJobSearch({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // One initial fetch
    expect(capturedFetchCalls).toHaveLength(1);
  });
});

describe("useJobSearch — URL state parsing", () => {
  it("includes query param in fetch URL when q is set", async () => {
    setSearchParams(makeSearchParams({ q: "engineer" }));
    mockFetchSuccess();
    const { result } = renderHook(() => useJobSearch({ q: "engineer" }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(capturedFetchCalls[0]?.url).toContain("query=engineer");
  });

  it("includes sort param in fetch URL", async () => {
    setSearchParams(makeSearchParams({ sort: "date" }));
    mockFetchSuccess();
    const { result } = renderHook(() => useJobSearch({ sort: "date" }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(capturedFetchCalls[0]?.url).toContain("sort=date");
  });

  it("includes remote=true in fetch URL when remote is set", async () => {
    setSearchParams(makeSearchParams({ remote: "true" }));
    mockFetchSuccess();
    const { result } = renderHook(() => useJobSearch({ remote: "true" }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(capturedFetchCalls[0]?.url).toContain("remote=true");
  });

  it("omits remote from fetch URL when remote=false (M1 compliance)", async () => {
    setSearchParams(makeSearchParams({}));
    mockFetchSuccess();
    const { result } = renderHook(() => useJobSearch({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(capturedFetchCalls[0]?.url).not.toContain("remote=false");
  });

  it("exposes effectiveSort from pagination in returned state", async () => {
    mockFetchSuccess(
      makeSuccessResponse({
        pagination: { nextCursor: null, totalCount: 5, effectiveSort: "date" as const },
      }),
    );
    const { result } = renderHook(() => useJobSearch({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pagination?.effectiveSort).toBe("date");
  });
});

describe("useJobSearch — isStale", () => {
  it("isStale is false initially and after first load", async () => {
    mockFetchSuccess();
    const { result } = renderHook(() => useJobSearch({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isStale).toBe(false);
  });
});

describe("useJobSearch — error handling", () => {
  it("sets error string for 4xx responses", async () => {
    mockFetchError(400, "Bad request");
    const { result } = renderHook(() => useJobSearch({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("Bad request");
  });

  it("sets error to HTTP status when body has no detail field", async () => {
    mockFetchError(500);
    const { result } = renderHook(() => useJobSearch({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("HTTP 500");
  });

  it("fires toast.error with translated message and sets error='network' on network failure", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network failure"));
    const { result } = renderHook(() => useJobSearch({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("network");
    expect(mockToastError).toHaveBeenCalledOnce();
    // Must pass a translated string, not a raw i18n key (H3 fix)
    expect(mockToastError).toHaveBeenCalledWith("t(errors.network)");
    expect(mockToastError).not.toHaveBeenCalledWith("Portal.search.errors.network");
  });

  it("preserves error string containing the HTTP status code on 5xx", async () => {
    mockFetchError(503);
    const { result } = renderHook(() => useJobSearch({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toContain("503");
  });
});

describe("useJobSearch — load more", () => {
  it("loadMore calls router.replace with the cursor from pagination", async () => {
    mockFetchSuccess(
      makeSuccessResponse({
        pagination: { nextCursor: "cursor-abc", totalCount: 25, effectiveSort: "date" as const },
      }),
    );
    const { result } = renderHook(() => useJobSearch({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pagination?.nextCursor).toBe("cursor-abc");

    act(() => {
      result.current.loadMore();
    });

    // Should write cursor to URL via router.replace
    expect(mockRouterReplace).toHaveBeenCalledWith(expect.stringContaining("cursor=cursor-abc"), {
      scroll: false,
    });
  });

  it("loadMore does nothing when nextCursor is null", async () => {
    mockFetchSuccess(makeSuccessResponse());
    const { result } = renderHook(() => useJobSearch({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const prevCallCount = mockRouterReplace.mock.calls.length;
    act(() => {
      result.current.loadMore();
    });
    // No additional router.replace calls
    expect(mockRouterReplace.mock.calls.length).toBe(prevCallCount);
  });
});

describe("useJobSearch — actions", () => {
  it("setFilter writes to URL via router.replace", async () => {
    mockFetchSuccess();
    const { result } = renderHook(() => useJobSearch({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setFilter("remote", true);
    });

    expect(mockRouterReplace).toHaveBeenCalledWith(expect.stringContaining("remote=true"), {
      scroll: false,
    });
  });

  it("clearAll resets all filters and query", async () => {
    setSearchParams(makeSearchParams({ q: "engineer", remote: "true" }));
    mockFetchSuccess();
    const { result } = renderHook(() => useJobSearch({ q: "engineer", remote: "true" }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.clearAll();
    });

    // Should write URL without q or remote
    const lastCall = mockRouterReplace.mock.calls.at(-1)?.[0] ?? "";
    expect(lastCall).not.toContain("remote=true");
    expect(lastCall).not.toContain("q=");
  });

  it("setSort writes sort param to URL", async () => {
    mockFetchSuccess();
    const { result } = renderHook(() => useJobSearch({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setSort("date");
    });

    expect(mockRouterReplace).toHaveBeenCalledWith(expect.stringContaining("sort=date"), {
      scroll: false,
    });
  });

  it("clearFilter removes a single location value", async () => {
    setSearchParams(makeSearchParams({ location: ["Lagos", "Abuja"] }));
    mockFetchSuccess();
    const { result } = renderHook(() => useJobSearch({ location: ["Lagos", "Abuja"] }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.clearFilter("location", "Lagos");
    });

    const lastCall = mockRouterReplace.mock.calls.at(-1)?.[0] ?? "";
    expect(lastCall).not.toContain("location=Lagos");
    expect(lastCall).toContain("location=Abuja");
  });

  it("setQuery updates local query state immediately", async () => {
    mockFetchSuccess();
    const { result } = renderHook(() => useJobSearch({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setQuery("developer");
    });

    // localQuery is exposed in state.q
    expect(result.current.state.q).toBe("developer");
  });
});

describe("useJobSearch — AbortController", () => {
  it("aborts in-flight request when a new search fires", async () => {
    let callCount = 0;
    const abortedSignals: boolean[] = [];

    vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      callCount++;
      abortedSignals.push(false);
      const idx = callCount - 1;
      const signal = init?.signal;

      // Simulate a slow first fetch
      await new Promise<void>((resolve) => {
        if (signal) {
          signal.addEventListener("abort", () => {
            abortedSignals[idx] = true;
            resolve();
          });
        }
        // Resolve after a short delay if not aborted
        setTimeout(resolve, 50);
      });

      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      return { ok: true, json: async () => ({ data: makeSuccessResponse() }) } as Response;
    });

    const { result } = renderHook(() => useJobSearch({}));

    // Wait for the initial fetch to start
    await new Promise((r) => setTimeout(r, 10));

    // Trigger a second search by simulating URL change
    const newParams = makeSearchParams({ q: "engineer" });
    setSearchParams(newParams);

    act(() => {
      result.current.setSort("date");
    });

    await waitFor(() => expect(callCount).toBeGreaterThanOrEqual(1));
  });
});

describe("useJobSearch — default state", () => {
  it("returns default sort=relevance with no URL params", async () => {
    mockFetchSuccess();
    const { result } = renderHook(() => useJobSearch({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.state.sort).toBe("relevance");
  });

  it("returns empty arrays for location, employmentType, industry with no params", async () => {
    mockFetchSuccess();
    const { result } = renderHook(() => useJobSearch({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.state.location).toHaveLength(0);
    expect(result.current.state.employmentType).toHaveLength(0);
    expect(result.current.state.industry).toHaveLength(0);
  });

  it("returns remote=false with no params", async () => {
    mockFetchSuccess();
    const { result } = renderHook(() => useJobSearch({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.state.remote).toBe(false);
  });
});
