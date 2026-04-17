"use client";

import { useTranslations } from "next-intl";
import { useState, useId } from "react";
import { SearchIcon, FilterIcon, LoaderIcon, XIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useJobSearch } from "@/hooks/use-job-search";
import { useMatchScores } from "@/hooks/use-match-scores";
import { countActiveFilters } from "@/lib/search-url-params";
import type { JobSearchUrlState } from "@/lib/search-url-params";
import { JobSearchFilterPanel, JobSearchFilterPanelSkeleton } from "./job-search-filter-panel";
import { ActiveFiltersBar } from "./active-filters-bar";
import { JobResultCard, JobResultCardSkeleton } from "./job-result-card";
import { JobSearchSortDropdown } from "./job-search-sort-dropdown";
import { JobSearchEmptyState } from "./job-search-empty-state";
import { CompleteProfilePrompt } from "./complete-profile-prompt";

interface JobSearchPageContentProps {
  initialParams: Record<string, string | string[] | undefined>;
}

/**
 * Client-side search page content.
 *
 * URL is the single source of truth (AC #2). This component wires together:
 *   - useJobSearch hook (URL state ↔ fetch orchestration)
 *   - JobSearchFilterPanel (sidebar on lg+, Sheet on mobile)
 *   - ActiveFiltersBar (removable chips)
 *   - Sort dropdown + results summary
 *   - Results grid (JobResultCard × N + skeletons)
 *   - Load More pagination
 *   - Empty states (filtered vs cold-start)
 */
export function JobSearchPageContent({ initialParams }: JobSearchPageContentProps) {
  const t = useTranslations("Portal.search");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const filterSheetTitleId = useId();
  const { data: session } = useSession();

  const {
    state,
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
  } = useJobSearch(initialParams);

  const isSeeker = session?.user?.activePortalRole === "JOB_SEEKER";
  const jobIds = results.map((item) => item.id);
  const { scores, isLoading: matchLoading } = useMatchScores(jobIds, isSeeker);
  const showCompleteProfilePrompt =
    isSeeker && !matchLoading && Object.keys(scores).length === 0 && results.length > 0;

  const activeFilterCount = countActiveFilters(state);
  const queryHasValue = state.q.trim().length > 0;
  const hasResults = results.length > 0;
  const isEmpty = !isLoading && results.length === 0 && !isStale;
  const isColdStart = isEmpty && state.q === "" && activeFilterCount === 0;
  const isFilteredEmpty = isEmpty && !isColdStart;

  const handleRemoveFilter = (key: keyof JobSearchUrlState, value?: string) => {
    clearFilter(key, value);
  };

  const handleSetFilter = <K extends keyof JobSearchUrlState>(
    key: K,
    value: JobSearchUrlState[K],
  ) => {
    setFilter(key, value);
  };

  const filterPanel = (
    <JobSearchFilterPanel facets={facets} filters={state} onChange={handleSetFilter} />
  );

  return (
    <div className="py-6" data-testid="search-page-content">
      {/* Page heading */}
      <h1 className="text-2xl font-bold mb-4">{t("heading")}</h1>

      {/* Search bar */}
      <form role="search" className="relative mb-4" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="job-search-input" className="sr-only">
          {t("searchBarAriaLabel")}
        </label>
        <SearchIcon
          className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
          aria-hidden="true"
        />
        <input
          id="job-search-input"
          type="search"
          value={state.q}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchBarPlaceholder")}
          aria-label={t("searchBarAriaLabel")}
          className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-10 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {state.q && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t("clearSearchAriaLabel")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-4" aria-hidden="true" />
          </button>
        )}
      </form>

      {/* Active filters bar (above results, below search) */}
      {activeFilterCount > 0 && (
        <div className="mb-3">
          <ActiveFiltersBar filters={state} onRemove={handleRemoveFilter} onClearAll={clearAll} />
        </div>
      )}

      {/* Main layout: sidebar (lg+) | stack (mobile) */}
      <div className="lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
        {/* Desktop sidebar filter */}
        <aside className="hidden lg:block" data-testid="desktop-filter-sidebar">
          {isLoading && !hasResults ? <JobSearchFilterPanelSkeleton /> : filterPanel}
        </aside>

        {/* Results column */}
        <div className="space-y-4">
          {/* Results header: mobile filter button + sort + summary */}
          <div className="flex flex-wrap items-center gap-3 justify-between">
            {/* Mobile filter trigger */}
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden flex items-center gap-1.5"
              onClick={() => setFilterSheetOpen(true)}
              aria-expanded={filterSheetOpen}
              aria-controls="filter-sheet"
              aria-label={
                activeFilterCount > 0
                  ? `${t("openFiltersAriaLabel")} (${activeFilterCount} active)`
                  : t("openFiltersButton")
              }
              data-testid="open-filters-button"
            >
              <FilterIcon className="size-4" aria-hidden="true" />
              {t("openFiltersButton")}
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>

            {/* Sort dropdown */}
            <JobSearchSortDropdown
              requestedSort={state.sort}
              effectiveSort={pagination?.effectiveSort ?? state.sort}
              onChange={setSort}
            />
          </div>

          {/* Results summary (aria-live region) */}
          <div
            aria-live="polite"
            className="text-sm text-muted-foreground"
            data-testid="results-summary"
          >
            {isLoading && !hasResults ? (
              <span>{t("resultsSummaryUpdating")}</span>
            ) : isStale ? (
              <span className="flex items-center gap-1.5">
                <LoaderIcon className="size-3.5 animate-spin" aria-hidden="true" />
                {t("resultsSummaryUpdating")}
              </span>
            ) : pagination && hasResults ? (
              <span>
                {t("resultsSummary", {
                  shown: results.length,
                  total: pagination.totalCount,
                })}
              </span>
            ) : null}
          </div>

          {/* Complete profile prompt — shown when seeker has no match scores yet */}
          {showCompleteProfilePrompt && <CompleteProfilePrompt />}

          {/* Results grid */}
          {/* AC #8: results remain interactive during stale overlay — opacity only, no pointer-events blocker. */}
          <div
            className={cn("space-y-3", isStale && "opacity-50")}
            aria-busy={isLoading || isStale}
            data-testid={isStale ? "results-stale-overlay" : "results-grid"}
          >
            {isLoading && !hasResults ? (
              /* Initial loading — 3 skeleton cards */
              <>
                <JobResultCardSkeleton />
                <JobResultCardSkeleton />
                <JobResultCardSkeleton />
              </>
            ) : isFilteredEmpty ? (
              <JobSearchEmptyState variant="filtered" onClearFilters={clearAll} />
            ) : isColdStart ? (
              <JobSearchEmptyState variant="cold-start" />
            ) : (
              results.map((item) => (
                <JobResultCard
                  key={item.id}
                  item={item}
                  queryHasValue={queryHasValue}
                  matchScore={scores[item.id] ?? null}
                />
              ))
            )}
          </div>

          {/* Load More / End of Results */}
          {hasResults && !isLoading && (
            <div className="flex justify-center pt-4">
              {pagination?.nextCursor ? (
                <Button
                  variant="outline"
                  onClick={loadMore}
                  disabled={isStale}
                  data-testid="load-more-button"
                  aria-busy={isStale}
                  className="min-w-[120px]"
                >
                  {isStale ? (
                    <span className="flex items-center gap-2">
                      <LoaderIcon className="size-4 animate-spin" aria-hidden="true" />
                      {t("loadingMore")}
                    </span>
                  ) : (
                    t("loadMore")
                  )}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="end-of-results">
                  {t("endOfResults")}
                </p>
              )}
            </div>
          )}

          {/* Network error banner (inline, not toast — for 4xx errors) */}
          {error && error !== "network" && (
            <div
              role="alert"
              data-testid="search-error-banner"
              className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter Sheet */}
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent
          side="bottom"
          id="filter-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby={filterSheetTitleId}
          className="max-h-[85vh] overflow-y-auto"
          data-testid="filter-sheet"
        >
          <SheetHeader>
            <SheetTitle id={filterSheetTitleId}>{t("filtersHeading")}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 pb-6">{filterPanel}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** Skeleton for the entire page content during initial SSR → client hydration */
export function JobSearchPageContentSkeleton() {
  return (
    <div className="py-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full" />
      <div className="lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
        <div className="hidden lg:block space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <div className="space-y-3">
          <JobResultCardSkeleton />
          <JobResultCardSkeleton />
          <JobResultCardSkeleton />
        </div>
      </div>
    </div>
  );
}
