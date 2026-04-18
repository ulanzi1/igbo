// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSimilarJobs } from "./use-similar-jobs";
import type { JobSearchResultItem } from "@/lib/validations/job-search";

const sampleJob: JobSearchResultItem = {
  id: "job-1",
  title: "Frontend Developer",
  companyName: "Acme Corp",
  companyId: "company-1",
  companyLogoUrl: null,
  location: "Lagos, Nigeria",
  salaryMin: 60000,
  salaryMax: 90000,
  salaryCompetitiveOnly: false,
  employmentType: "full_time",
  culturalContext: null,
  applicationDeadline: null,
  createdAt: "2026-04-10T00:00:00Z",
  relevance: null,
  snippet: null,
};

function makeSuccessResponse(jobs: JobSearchResultItem[] = []) {
  return {
    ok: true,
    json: () => Promise.resolve({ data: { jobs } }),
  } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSimilarJobs — initial state", () => {
  it("returns isLoading=true and empty jobs initially", () => {
    vi.spyOn(global, "fetch").mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSimilarJobs("job-uuid-1"));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.jobs).toEqual([]);
    expect(result.current.error).toBe(false);
  });
});

describe("useSimilarJobs — success", () => {
  it("fetches from the correct URL on mount", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(makeSuccessResponse([sampleJob]));

    renderHook(() => useSimilarJobs("job-uuid-1"));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/jobs/job-uuid-1/similar",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("sets jobs and isLoading=false after successful fetch", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(makeSuccessResponse([sampleJob]));

    const { result } = renderHook(() => useSimilarJobs("job-uuid-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.jobs).toHaveLength(1);
    expect(result.current.jobs[0]!.id).toBe("job-1");
    expect(result.current.error).toBe(false);
  });

  it("sets jobs=[] and isLoading=false when server returns empty array", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(makeSuccessResponse([]));

    const { result } = renderHook(() => useSimilarJobs("job-uuid-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.jobs).toEqual([]);
    expect(result.current.error).toBe(false);
  });
});

describe("useSimilarJobs — error handling", () => {
  it("sets error=true and jobs=[] on fetch failure", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useSimilarJobs("job-uuid-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.jobs).toEqual([]);
  });

  it("sets error=true on non-ok response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    } as Response);

    const { result } = renderHook(() => useSimilarJobs("job-uuid-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.jobs).toEqual([]);
  });
});

describe("useSimilarJobs — cleanup", () => {
  it("aborts in-flight request on unmount", async () => {
    let capturedSignal: AbortSignal | undefined;

    vi.spyOn(global, "fetch").mockImplementationOnce((_url, options) => {
      capturedSignal = (options as RequestInit | undefined)?.signal ?? undefined;
      return new Promise<Response>((_, reject) => {
        capturedSignal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("AbortError"), { name: "AbortError" }));
        });
      });
    });

    const { unmount } = renderHook(() => useSimilarJobs("job-uuid-1"));

    await waitFor(() => expect(capturedSignal).toBeDefined());

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });

  it("re-fetches when jobId changes", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(makeSuccessResponse([sampleJob]));

    const { rerender } = renderHook(({ id }) => useSimilarJobs(id), {
      initialProps: { id: "job-uuid-1" },
    });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    rerender({ id: "job-uuid-2" });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(fetchSpy).toHaveBeenLastCalledWith(
      "/api/v1/jobs/job-uuid-2/similar",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
