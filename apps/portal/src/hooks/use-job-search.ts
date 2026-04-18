"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  parseSearchUrlParams,
  serializeSearchUrlParams,
  DEFAULT_SEARCH_STATE,
  type JobSearchUrlState,
  type SortValue,
  type PortalEmploymentTypeValue,
} from "@/lib/search-url-params";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type {
  JobSearchResponse,
  JobSearchResultItem,
  FacetValue,
  SalaryRangeFacet,
} from "@/lib/validations/job-search";

// Re-export for convenience
export type { SortValue };
// Need to import PortalEmploymentTypeValue from original source for the filter setter type
export type { PortalEmploymentTypeValue };

interface UseJobSearchReturn {
  // Current filter state (derived from URL)
  state: JobSearchUrlState;
  // Accumulated results (across "Load More" pages)
  results: JobSearchResultItem[];
  // Latest facets from last response
  facets: {
    location: FacetValue[];
    employmentType: FacetValue[];
    industry: FacetValue[];
    salaryRange: SalaryRangeFacet[];
  } | null;
  // Pagination info
  pagination: {
    nextCursor: string | null;
    totalCount: number;
    effectiveSort: SortValue;
  } | null;
  isLoading: boolean;
  isStale: boolean; // true while a refetch is in-flight with stale results visible
  error: string | null;
  // Actions
  loadMore: () => void;
  setFilter: <K extends keyof JobSearchUrlState>(key: K, value: JobSearchUrlState[K]) => void;
  setQuery: (q: string) => void;
  setSort: (sort: SortValue) => void;
  clearFilter: (key: keyof JobSearchUrlState, value?: string) => void;
  clearAll: () => void;
}

/**
 * Orchestrates the search URL state ↔ fetch cycle.
 *
 * URL is the single source of truth. Derived state (accumulated results, facets,
 * pagination) lives in React state. The hook:
 *   1. Reads URL via useSearchParams() — authoritative runtime source.
 *   2. Debounces text queries (300 ms); non-text changes are immediate.
 *   3. Fires fetch on URL change; cancels in-flight requests via AbortController.
 *   4. Accumulates results on loadMore; resets on any non-cursor state change.
 *   5. Writes state back to URL via router.replace({ scroll: false }).
 */
export function useJobSearch(
  _initialParams: Record<string, string | string[] | undefined>,
): UseJobSearchReturn {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("Portal.search");

  // Parse current URL state — this is the authoritative runtime state.
  const urlState: JobSearchUrlState = parseSearchUrlParams(searchParams);

  // Local query value that we debounce before writing to URL.
  const [localQuery, setLocalQuery] = useState(urlState.q);
  const debouncedQuery = useDebouncedValue(localQuery, 300);

  // Derived state
  const [results, setResults] = useState<JobSearchResultItem[]>([]);
  const [facets, setFacets] = useState<UseJobSearchReturn["facets"]>(null);
  const [pagination, setPagination] = useState<UseJobSearchReturn["pagination"]>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track whether we've seeded state from initialParams on mount
  const initializedRef = useRef(false);
  // AbortController ref — cancelled before each new fetch
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync debouncedQuery back to URL (only when changed and different from URL)
  useEffect(() => {
    const currentQ = urlState.q;
    if (debouncedQuery === currentQ) return;
    const newState: JobSearchUrlState = { ...urlState, q: debouncedQuery, cursor: null };
    const params = serializeSearchUrlParams(newState);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [debouncedQuery]); // intentional: only re-run when debounced query changes

  // Keep localQuery in sync when URL changes externally (back button, etc.)
  useEffect(() => {
    setLocalQuery(urlState.q);
  }, [urlState.q]);

  // -------------------------------------------------------------------------
  // Reset rule: when any non-cursor URL state changes, clear accumulated results.
  // Derived as JSON.stringify(omit(urlState, ['cursor'])) for stable comparison.
  // -------------------------------------------------------------------------
  const nonCursorStateKey = JSON.stringify({
    q: urlState.q,
    sort: urlState.sort,
    location: urlState.location,
    employmentType: urlState.employmentType,
    industry: urlState.industry,
    salaryMin: urlState.salaryMin,
    salaryMax: urlState.salaryMax,
    remote: urlState.remote,
    culturalContextDiasporaFriendly: urlState.culturalContextDiasporaFriendly,
    culturalContextIgboPreferred: urlState.culturalContextIgboPreferred,
    culturalContextCommunityReferred: urlState.culturalContextCommunityReferred,
  });

  const nonCursorStateKeyRef = useRef(nonCursorStateKey);
  const isLoadMoreRef = useRef(false);

  // -------------------------------------------------------------------------
  // Main fetch effect — fires on URL change
  // -------------------------------------------------------------------------
  useEffect(() => {
    const isNonCursorChange = nonCursorStateKey !== nonCursorStateKeyRef.current;

    if (isNonCursorChange) {
      // Any filter/query/sort change → reset accumulated results
      setResults([]);
      isLoadMoreRef.current = false;
      nonCursorStateKeyRef.current = nonCursorStateKey;
    }

    // Cancel previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const hasExistingResults = !isNonCursorChange && results.length > 0;

    if (hasExistingResults) {
      // Stale overlay — dim existing results while refetch is in-flight
      setIsStale(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    // Build the fetch URL — translate URL state to API query params
    const apiParams = new URLSearchParams();
    if (urlState.q) apiParams.set("query", urlState.q);
    apiParams.set("sort", urlState.sort);
    if (urlState.cursor) apiParams.set("cursor", urlState.cursor);

    // Filters
    for (const loc of urlState.location) apiParams.append("location", loc);
    for (const et of urlState.employmentType) apiParams.append("employmentType", et);
    for (const ind of urlState.industry) apiParams.append("industry", ind);
    if (urlState.salaryMin !== null) apiParams.set("salaryMin", String(urlState.salaryMin));
    if (urlState.salaryMax !== null) apiParams.set("salaryMax", String(urlState.salaryMax));
    if (urlState.remote) apiParams.set("remote", "true");
    if (urlState.culturalContextDiasporaFriendly)
      apiParams.set("culturalContextDiasporaFriendly", "true");
    if (urlState.culturalContextIgboPreferred)
      apiParams.set("culturalContextIgboPreferred", "true");
    if (urlState.culturalContextCommunityReferred)
      apiParams.set("culturalContextCommunityReferred", "true");

    const fetchUrl = `/api/v1/jobs/search?${apiParams.toString()}`;

    (async () => {
      try {
        const response = await fetch(fetchUrl, {
          signal: controller.signal,
          headers: { "Accept-Language": locale },
        });

        if (controller.signal.aborted) return;

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
          const detail = typeof body["detail"] === "string" ? body["detail"] : null;
          setError(detail ?? `HTTP ${response.status}`);
          return;
        }

        const envelope = (await response.json()) as { data: JobSearchResponse };
        const data = envelope.data;
        if (controller.signal.aborted) return;

        // Append or replace results
        if (isLoadMoreRef.current && !isNonCursorChange) {
          setResults((prev) => [...prev, ...data.results]);
        } else {
          setResults(data.results);
        }

        setFacets(data.facets);
        setPagination({
          nextCursor: data.pagination.nextCursor,
          totalCount: data.pagination.totalCount,
          effectiveSort: data.pagination.effectiveSort,
        });
        isLoadMoreRef.current = false;
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Search fetch error:", err);
        // Network errors surface as toast; results remain visible (stale overlay philosophy)
        toast.error(t("errors.network"));
        setError("network");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsStale(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [searchParams.toString(), locale]); // intentional: stable serialized key + locale

  // On mount with initialParams — seed state if URL is empty
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    // initialParams serves as SSR hydration hint only.
    // useSearchParams() is authoritative — no action needed here.
    // The fetch effect above handles the initial fetch via searchParams dependency.
  }, []); // intentional: run only on mount

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const writeUrl = useCallback(
    (newState: JobSearchUrlState) => {
      const params = serializeSearchUrlParams(newState);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router],
  );

  const setFilter = useCallback(
    <K extends keyof JobSearchUrlState>(key: K, value: JobSearchUrlState[K]) => {
      const newState: JobSearchUrlState = { ...urlState, [key]: value, cursor: null };
      writeUrl(newState);
    },
    [urlState, writeUrl],
  );

  const setQuery = useCallback((q: string) => {
    setLocalQuery(q);
  }, []);

  const setSort = useCallback(
    (sort: SortValue) => {
      const newState: JobSearchUrlState = { ...urlState, sort, cursor: null };
      writeUrl(newState);
    },
    [urlState, writeUrl],
  );

  const clearFilter = useCallback(
    (key: keyof JobSearchUrlState, value?: string) => {
      const current = urlState[key];
      let newValue: JobSearchUrlState[keyof JobSearchUrlState];

      if (Array.isArray(current) && value !== undefined) {
        newValue = current.filter((v: string) => v !== value);
      } else if (typeof current === "boolean") {
        newValue = false;
      } else if (typeof current === "number" || current === null) {
        newValue = null;
      } else {
        newValue = DEFAULT_SEARCH_STATE[key];
      }

      const newState: JobSearchUrlState = {
        ...urlState,
        [key]: newValue,
        cursor: null,
      };
      writeUrl(newState);
    },
    [urlState, writeUrl],
  );

  const clearAll = useCallback(() => {
    const newState: JobSearchUrlState = {
      ...DEFAULT_SEARCH_STATE,
      sort: urlState.sort, // preserve sort per AC #5
    };
    setLocalQuery("");
    writeUrl(newState);
  }, [urlState.sort, writeUrl]);

  const loadMore = useCallback(() => {
    if (!pagination?.nextCursor || isLoading || isStale) return;
    isLoadMoreRef.current = true;
    const newState: JobSearchUrlState = { ...urlState, cursor: pagination.nextCursor };
    writeUrl(newState);
  }, [urlState, pagination, isLoading, isStale, writeUrl]);

  return {
    state: { ...urlState, q: localQuery }, // expose local (pre-debounce) q for the input
    results,
    facets,
    pagination,
    isLoading,
    isStale,
    error,
    loadMore,
    setFilter,
    setQuery,
    setSort,
    clearFilter,
    clearAll,
  };
}
