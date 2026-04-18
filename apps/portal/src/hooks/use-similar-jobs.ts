"use client";

import { useState, useEffect } from "react";
import type { JobSearchResultItem } from "@/lib/validations/job-search";

export interface UseSimilarJobsResult {
  jobs: JobSearchResultItem[];
  isLoading: boolean;
  error: boolean;
}

/**
 * Fetches similar jobs for the given jobId from GET /api/v1/jobs/[jobId]/similar.
 *
 * Non-blocking: fetches client-side after hydration via useEffect + fetch + AbortController.
 * Stable: only re-fetches when jobId changes.
 *
 * Returns:
 *   - { jobs: [], isLoading: true, error: false } initially
 *   - { jobs: [...], isLoading: false, error: false } on success
 *   - { jobs: [], isLoading: false, error: true } on fetch failure
 */
export function useSimilarJobs(jobId: string): UseSimilarJobsResult {
  const [jobs, setJobs] = useState<JobSearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(false);

    fetch(`/api/v1/jobs/${jobId}/similar`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch similar jobs");
        return res.json() as Promise<{ data: { jobs: JobSearchResultItem[] } }>;
      })
      .then(({ data }) => {
        setJobs(data.jobs);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return; // cleanup — do nothing
        setJobs([]);
        setIsLoading(false);
        setError(true);
      });

    return () => {
      controller.abort();
    };
  }, [jobId]);

  return { jobs, isLoading, error };
}
