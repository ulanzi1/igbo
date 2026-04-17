// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMatchScores } from "./use-match-scores";
import type { MatchScoreResult } from "@igbo/config";

const sampleScore: MatchScoreResult = {
  score: 85,
  tier: "strong",
  signals: { skillsOverlap: 60, locationMatch: true, employmentTypeMatch: true },
};

const VALID_IDS = ["job-1", "job-2"];

function makeSuccessResponse(scores: Record<string, MatchScoreResult> = {}) {
  return {
    ok: true,
    json: () => Promise.resolve({ data: { scores } }),
  } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMatchScores — disabled", () => {
  it("returns empty scores and isLoading=false when enabled=false", () => {
    const { result } = renderHook(() => useMatchScores(VALID_IDS, false));
    expect(result.current.scores).toEqual({});
    expect(result.current.isLoading).toBe(false);
  });

  it("does NOT call fetch when enabled=false", () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    renderHook(() => useMatchScores(VALID_IDS, false));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns empty scores when enabled=true but jobIds is empty", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const { result } = renderHook(() => useMatchScores([], true));
    expect(result.current.scores).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("useMatchScores — enabled with valid jobIds", () => {
  it("fetches and returns scores when enabled=true", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(makeSuccessResponse({ "job-1": sampleScore }));

    const { result } = renderHook(() => useMatchScores(["job-1"], true));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.scores["job-1"]).toEqual(sampleScore);
  });

  it("sets isLoading=true while fetching, then false after", async () => {
    let resolve!: (res: Response) => void;
    const pending = new Promise<Response>((res) => {
      resolve = res;
    });

    vi.spyOn(global, "fetch").mockReturnValueOnce(pending);

    const { result } = renderHook(() => useMatchScores(["job-1"], true));

    // isLoading should be true after effect runs
    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    // Resolve the fetch
    act(() => {
      resolve(makeSuccessResponse({ "job-1": sampleScore }));
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });
});

describe("useMatchScores — deduplication", () => {
  it("does NOT re-fetch when jobIds reference changes but content is the same", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeSuccessResponse({ "job-1": sampleScore }));

    const ids1 = ["job-1"];
    const { rerender } = renderHook(({ ids }) => useMatchScores(ids, true), {
      initialProps: { ids: ids1 },
    });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    // Re-render with a new array reference containing the same content
    const ids2 = ["job-1"];
    rerender({ ids: ids2 });

    // Should still be 1 fetch (dedup by JSON.stringify)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("re-fetches when jobIds content changes", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeSuccessResponse({ "job-1": sampleScore }));

    const { rerender } = renderHook(({ ids }) => useMatchScores(ids, true), {
      initialProps: { ids: ["job-1"] },
    });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    // Re-render with different content
    rerender({ ids: ["job-1", "job-2"] });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });
});

describe("useMatchScores — error handling", () => {
  it("returns empty scores and isLoading=false on fetch error", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useMatchScores(["job-1"], true));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.scores).toEqual({});
  });

  it("returns empty scores on non-ok response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
    } as Response);

    const { result } = renderHook(() => useMatchScores(["job-1"], true));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.scores).toEqual({});
  });
});

describe("useMatchScores — cleanup", () => {
  it("aborts in-flight request on unmount", async () => {
    let capturedSignal: AbortSignal | undefined;

    vi.spyOn(global, "fetch").mockImplementationOnce((_url, options) => {
      capturedSignal = (options as RequestInit | undefined)?.signal ?? undefined;
      // Respond to abort signal so the worker can clean up without hanging
      return new Promise<Response>((_, reject) => {
        capturedSignal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("AbortError"), { name: "AbortError" }));
        });
      });
    });

    const { unmount } = renderHook(() => useMatchScores(["job-1"], true));

    // Wait for fetch to be called
    await waitFor(() => expect(capturedSignal).toBeDefined());

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });
});
