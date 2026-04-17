"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { MatchScoreResult } from "@igbo/config";

/**
 * Fetches match scores for the given job IDs from GET /api/v1/jobs/match-scores.
 *
 * Progressive enhancement hook — only fetches when `enabled` is true (i.e., the user
 * is an authenticated JOB_SEEKER). Returns empty scores for guests and non-seekers.
 *
 * Deduplicates: if `jobIds` content hasn't changed (via JSON.stringify), skips re-fetch.
 * Uses AbortController for cleanup on unmount or dependency change.
 *
 * Note: no react-query dependency — portal doesn't use it. Uses useEffect + fetch.
 */
export function useMatchScores(
  jobIds: string[],
  enabled: boolean,
): { scores: Record<string, MatchScoreResult>; isLoading: boolean } {
  const [scores, setScores] = useState<Record<string, MatchScoreResult>>({});
  const [isLoading, setIsLoading] = useState(false);
  const prevKeyRef = useRef<string | null>(null);

  // Stabilize jobIds by content so the effect doesn't re-run on every render
  // when the parent creates a new array reference with the same content.
  const jobIdsKey = useMemo(() => JSON.stringify(jobIds), [jobIds]);

  useEffect(() => {
    if (!enabled || jobIds.length === 0) {
      // Use functional update to avoid infinite re-renders when jobIds reference changes
      setScores((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      setIsLoading(false);
      prevKeyRef.current = null;
      return;
    }

    if (jobIdsKey === prevKeyRef.current) return; // same IDs — skip re-fetch
    prevKeyRef.current = jobIdsKey;

    const controller = new AbortController();
    setIsLoading(true);

    fetch(`/api/v1/jobs/match-scores?jobIds=${jobIds.join(",")}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch match scores");
        return res.json() as Promise<{ data: { scores: Record<string, MatchScoreResult> } }>;
      })
      .then(({ data }) => {
        setScores(data.scores);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return; // cleanup — do nothing
        // Graceful degradation — log error silently in production, show no scores
        setScores({});
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [enabled, jobIdsKey]); // jobIdsKey is the stable stringified version; jobIds used only for .join() in fetch URL

  return { scores, isLoading };
}
