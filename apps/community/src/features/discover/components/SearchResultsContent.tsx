"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useGlobalSearch, useFilteredSearch } from "../hooks/use-global-search";
import type { SearchSection, SearchResultItem, SearchFilters } from "../hooks/use-global-search";
import { SearchIcon, LoaderIcon, AlertCircleIcon, XIcon, FilterIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Type-specific card components ─────────────────────────────────────────────

function HighlightedText({ html }: { html: string | null | undefined }) {
  if (!html) return null;
  // highlight is sanitized server-side (only <mark> tags allowed)
  return (
    <span
      className="text-xs text-muted-foreground [&_mark]:bg-yellow-200 [&_mark]:dark:bg-yellow-800 [&_mark]:rounded [&_mark]:px-0.5"
      // ci-allow-unsanitized-html — search highlight emits only <mark> tags (server-generated)
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function MemberCard({ item }: { item: SearchResultItem }) {
  return (
    <li>
      <Link
        href={item.href as "/"}
        className="flex items-start gap-3 px-4 py-3 hover:bg-muted transition-colors"
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            aria-hidden="true"
            className="size-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold uppercase text-muted-foreground">
            {item.title[0] ?? "?"}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
          {item.subtitle && (
            <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
          )}
          {item.highlight && <HighlightedText html={item.highlight} />}
        </span>
      </Link>
    </li>
  );
}

function PostCard({ item }: { item: SearchResultItem }) {
  return (
    <li>
      <Link
        href={item.href as "/"}
        className="flex items-start gap-3 px-4 py-3 hover:bg-muted transition-colors"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase text-muted-foreground">
          P
        </span>
        <span className="min-w-0 flex-1">
          {item.highlight ? (
            <HighlightedText html={item.highlight} />
          ) : (
            <span className="block truncate text-sm text-foreground">{item.title}</span>
          )}
          {item.subtitle && (
            <span className="block truncate text-xs text-muted-foreground mt-0.5">
              {item.subtitle}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

function ArticleCard({ item }: { item: SearchResultItem }) {
  return (
    <li>
      <Link
        href={item.href as "/"}
        className="flex items-start gap-3 px-4 py-3 hover:bg-muted transition-colors"
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            aria-hidden="true"
            className="size-12 shrink-0 rounded object-cover"
          />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded bg-muted text-xs font-semibold uppercase text-muted-foreground">
            A
          </span>
        )}
        <span className="min-w-0 flex-1">
          {item.highlight ? (
            <span className="block mb-0.5">
              <HighlightedText html={item.highlight} />
            </span>
          ) : (
            <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
          )}
          {item.subtitle && (
            <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
          )}
        </span>
      </Link>
    </li>
  );
}

function GroupCard({ item }: { item: SearchResultItem }) {
  return (
    <li>
      <Link
        href={item.href as "/"}
        className="flex items-start gap-3 px-4 py-3 hover:bg-muted transition-colors"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded bg-muted text-sm font-semibold uppercase text-muted-foreground">
          G
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
          {item.highlight ? (
            <HighlightedText html={item.highlight} />
          ) : item.subtitle ? (
            <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

function EventCard({ item }: { item: SearchResultItem }) {
  return (
    <li>
      <Link
        href={item.href as "/"}
        className="flex items-start gap-3 px-4 py-3 hover:bg-muted transition-colors"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded bg-muted text-sm font-semibold uppercase text-muted-foreground">
          E
        </span>
        <span className="min-w-0 flex-1">
          {item.highlight ? (
            <span className="block mb-0.5">
              <HighlightedText html={item.highlight} />
            </span>
          ) : (
            <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
          )}
          {item.subtitle && (
            <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
          )}
        </span>
      </Link>
    </li>
  );
}

function TypeCard({ item }: { item: SearchResultItem }) {
  switch (item.type) {
    case "members":
      return <MemberCard item={item} />;
    case "posts":
      return <PostCard item={item} />;
    case "articles":
      return <ArticleCard item={item} />;
    case "groups":
      return <GroupCard item={item} />;
    case "events":
      return <EventCard item={item} />;
    default:
      return <ResultRow item={item} />;
  }
}

// ── Generic result row (overview mode) ───────────────────────────────────────

function ResultRow({ item }: { item: SearchResultItem }) {
  return (
    <li>
      <Link
        href={item.href as "/"}
        className="flex items-start gap-3 px-4 py-3 hover:bg-muted transition-colors"
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            aria-hidden="true"
            className="size-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase text-muted-foreground">
            {item.title[0] ?? "?"}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
          {item.subtitle && (
            <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
          )}
        </span>
      </Link>
    </li>
  );
}

// ── Overview section card ─────────────────────────────────────────────────────

function ResultSectionCard({
  section,
  onSeeAll,
}: {
  section: SearchSection;
  onSeeAll: (type: string) => void;
}) {
  const t = useTranslations("GlobalSearch");
  const sectionLabel = t(
    `sections.${section.type as "members" | "posts" | "articles" | "groups" | "events" | "documents"}`,
  );

  return (
    <section aria-label={sectionLabel} className="mb-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {sectionLabel}
      </h2>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
        {section.items.map((item) => (
          <ResultRow key={`${item.type}-${item.id}`} item={item} />
        ))}
      </ul>
      {section.hasMore && (
        <button
          type="button"
          onClick={() => onSeeAll(section.type)}
          className="mt-2 flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {t("seeAll", { section: sectionLabel })}
        </button>
      )}
    </section>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SearchSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="h-2 w-20 animate-pulse rounded bg-muted m-4 mb-2" />
          {[1, 2, 3].map((j) => (
            <div key={j} className="flex items-center gap-3 border-t border-border px-4 py-3">
              <div className="size-9 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Filter types ──────────────────────────────────────────────────────────────

const FILTERABLE_TYPES = ["members", "posts", "articles", "groups", "events"] as const;
type FilterableType = (typeof FILTERABLE_TYPES)[number];

// ── Active filter chips ───────────────────────────────────────────────────────

interface ActiveChipsProps {
  filters: SearchFilters;
  type: string;
  onRemove: (key: keyof SearchFilters) => void;
  onClearAll: () => void;
}

function ActiveChips({ filters, type, onRemove, onClearAll }: ActiveChipsProps) {
  const t = useTranslations("GlobalSearch");
  const chips: Array<{ key: keyof SearchFilters; label: string }> = [];

  if (filters.dateRange) {
    chips.push({
      key: "dateRange",
      label: t(`filters.dateRangeOptions.${filters.dateRange}`),
    });
  }
  if (filters.category) {
    chips.push({
      key: "category",
      label: t(`filters.categoryOptions.${filters.category}`),
    });
  }
  if (filters.location) {
    chips.push({ key: "location", label: filters.location });
  }
  if (filters.membershipTier) {
    chips.push({
      key: "membershipTier",
      label: t(`filters.membershipTierOptions.${filters.membershipTier}`),
    });
  }
  if (filters.authorId) {
    chips.push({ key: "authorId", label: filters.authorId.slice(0, 8) + "…" });
  }

  if (chips.length === 0) return null;

  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-2"
      aria-label={t("activeFiltersAriaLabel")}
    >
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
        >
          {chip.label}
          <button
            type="button"
            aria-label={t("filters.clear")}
            onClick={() => onRemove(chip.key)}
            className="ml-1 rounded-full hover:bg-primary/20 p-0.5"
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-xs text-muted-foreground hover:text-foreground underline"
      >
        {t("filters.clearAll")}
      </button>
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

interface FilterBarProps {
  type: string;
  filters: SearchFilters;
  onTypeChange: (t: string) => void;
  onFilterChange: (key: keyof SearchFilters, value: string | undefined) => void;
}

function FilterBar({ type, filters, onTypeChange, onFilterChange }: FilterBarProps) {
  const t = useTranslations("GlobalSearch");
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <FilterIcon className="size-4" aria-hidden="true" />
          {t("filters.label")}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={expanded}
        >
          {expanded ? t("filters.collapse") : t("filters.expand")}
        </button>
      </div>

      {expanded && (
        <div className="flex flex-wrap gap-3">
          {/* Type selector */}
          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs text-muted-foreground">{t("filters.type")}</label>
            <select
              value={type}
              onChange={(e) => onTypeChange(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              aria-label={t("typeSelector")}
            >
              {FILTERABLE_TYPES.map((ft) => (
                <option key={ft} value={ft}>
                  {t(`sections.${ft}`)}
                </option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs text-muted-foreground">{t("filters.dateRange")}</label>
            <select
              value={filters.dateRange ?? ""}
              onChange={(e) => onFilterChange("dateRange", e.target.value || undefined)}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="">—</option>
              {(["today", "week", "month", "custom"] as const).map((dr) => (
                <option key={dr} value={dr}>
                  {t(`filters.dateRangeOptions.${dr}`)}
                </option>
              ))}
            </select>
          </div>

          {/* Custom date range */}
          {filters.dateRange === "custom" && (
            <>
              <div className="flex flex-col gap-1 min-w-[130px]">
                <label className="text-xs text-muted-foreground">{t("filters.dateFrom")}</label>
                <input
                  type="date"
                  value={filters.dateFrom ?? ""}
                  onChange={(e) => onFilterChange("dateFrom", e.target.value || undefined)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1 min-w-[130px]">
                <label className="text-xs text-muted-foreground">{t("filters.dateTo")}</label>
                <input
                  type="date"
                  value={filters.dateTo ?? ""}
                  onChange={(e) => onFilterChange("dateTo", e.target.value || undefined)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                />
              </div>
            </>
          )}

          {/* Category — only for posts */}
          {type === "posts" && (
            <div className="flex flex-col gap-1 min-w-[130px]">
              <label className="text-xs text-muted-foreground">{t("filters.category")}</label>
              <select
                value={filters.category ?? ""}
                onChange={(e) => onFilterChange("category", e.target.value || undefined)}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              >
                <option value="">—</option>
                {(["discussion", "event", "announcement"] as const).map((c) => (
                  <option key={c} value={c}>
                    {t(`filters.categoryOptions.${c}`)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Location — for members and events */}
          {(type === "members" || type === "events") && (
            <div className="flex flex-col gap-1 min-w-[130px]">
              <label className="text-xs text-muted-foreground">{t("filters.location")}</label>
              <LocationInput
                value={filters.location ?? ""}
                onChange={(v) => onFilterChange("location", v || undefined)}
                placeholder={t("filters.locationPlaceholder")}
              />
            </div>
          )}

          {/* Membership tier — only for members */}
          {type === "members" && (
            <div className="flex flex-col gap-1 min-w-[130px]">
              <label className="text-xs text-muted-foreground">{t("filters.membershipTier")}</label>
              <select
                value={filters.membershipTier ?? ""}
                onChange={(e) => onFilterChange("membershipTier", e.target.value || undefined)}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              >
                <option value="">—</option>
                {(["BASIC", "PROFESSIONAL", "TOP_TIER"] as const).map((tier) => (
                  <option key={tier} value={tier}>
                    {t(`filters.membershipTierOptions.${tier}`)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Debounced text input for location */
function LocationInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handleChange = (v: string) => {
    setLocal(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(v), 300);
  };

  return (
    <input
      type="text"
      value={local}
      onChange={(e) => handleChange(e.target.value)}
      className="rounded-md border border-border bg-background px-2 py-1 text-sm"
      placeholder={placeholder}
    />
  );
}

// ── Infinite scroll sentinel ──────────────────────────────────────────────────

function InfiniteScrollSentinel({
  onVisible,
  isLoading,
}: {
  onVisible: () => void;
  isLoading: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoading) {
          onVisible();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onVisible, isLoading]);

  return <div ref={ref} className="h-4" aria-hidden="true" />;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SearchResultsContentProps {
  initialQuery: string;
  initialType?: string;
  initialFilters?: SearchFilters;
}

// ── Main component ────────────────────────────────────────────────────────────

export function SearchResultsContent({
  initialQuery,
  initialType,
  initialFilters,
}: SearchResultsContentProps) {
  const t = useTranslations("GlobalSearch");
  const router = useRouter();

  const [query, setQuery] = useState(initialQuery);

  // Determine mode: filtered (specific type) vs overview (no type / "all")
  const isFilteredMode =
    !!initialType &&
    initialType !== "all" &&
    FILTERABLE_TYPES.includes(initialType as FilterableType);

  const [activeType, setActiveType] = useState<string>(
    isFilteredMode ? initialType! : FILTERABLE_TYPES[0],
  );
  const [filters, setFilters] = useState<SearchFilters>(initialFilters ?? {});

  // Overview mode hooks
  const overviewSearch = useGlobalSearch(isFilteredMode ? "" : query);

  // Filtered mode hooks
  const filteredSearch = useFilteredSearch(
    isFilteredMode ? { query, type: activeType, filters, limit: 10 } : { query: "", type: "" },
  );

  // URL sync helper
  const syncUrl = useCallback(
    (q: string, type: string | undefined, f: SearchFilters) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (type && type !== "all") params.set("type", type);
      if (f.dateRange) params.set("dateRange", f.dateRange);
      if (f.dateFrom) params.set("dateFrom", f.dateFrom);
      if (f.dateTo) params.set("dateTo", f.dateTo);
      if (f.authorId) params.set("authorId", f.authorId);
      if (f.category) params.set("category", f.category);
      if (f.location) params.set("location", f.location);
      if (f.membershipTier) params.set("membershipTier", f.membershipTier);
      const qs = params.toString();
      router.push(`/search${qs ? `?${qs}` : ""}`);
    },
    [router],
  );

  const handleSeeAll = useCallback(
    (type: string) => {
      syncUrl(query.trim(), type, {});
    },
    [query, syncUrl],
  );

  const handleTypeChange = useCallback(
    (newType: string) => {
      setActiveType(newType);
      // Clear type-specific filters when switching type
      const clearedFilters: SearchFilters = {
        dateRange: filters.dateRange,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      };
      setFilters(clearedFilters);
      syncUrl(query.trim(), newType, clearedFilters);
    },
    [filters.dateRange, filters.dateFrom, filters.dateTo, query, syncUrl],
  );

  const handleFilterChange = useCallback(
    (key: keyof SearchFilters, value: string | undefined) => {
      const newFilters = { ...filters, [key]: value };
      // Clear dateFrom/dateTo if dateRange changes away from custom
      if (key === "dateRange" && value !== "custom") {
        newFilters.dateFrom = undefined;
        newFilters.dateTo = undefined;
      }
      setFilters(newFilters);
      syncUrl(query.trim(), isFilteredMode ? activeType : undefined, newFilters);
    },
    [filters, query, activeType, isFilteredMode, syncUrl],
  );

  const handleRemoveFilter = useCallback(
    (key: keyof SearchFilters) => {
      const newFilters = { ...filters };
      delete newFilters[key];
      if (key === "dateRange") {
        delete newFilters.dateFrom;
        delete newFilters.dateTo;
      }
      setFilters(newFilters);
      syncUrl(query.trim(), isFilteredMode ? activeType : undefined, newFilters);
    },
    [filters, query, activeType, isFilteredMode, syncUrl],
  );

  const handleClearAllFilters = useCallback(() => {
    setFilters({});
    syncUrl(query.trim(), isFilteredMode ? activeType : undefined, {});
  }, [query, activeType, isFilteredMode, syncUrl]);

  const handleLoadMore = useCallback(() => {
    if (filteredSearch.hasNextPage && !filteredSearch.isFetchingNextPage) {
      void filteredSearch.fetchNextPage();
    }
  }, [filteredSearch]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const overviewHasResults =
    !isFilteredMode &&
    overviewSearch.data &&
    overviewSearch.data.sections.some((s) => s.items.length > 0);

  const filteredHasResults = isFilteredMode && filteredSearch.allItems.length > 0;

  const isLoading = isFilteredMode ? filteredSearch.isLoading : overviewSearch.isLoading;
  const isError = isFilteredMode ? filteredSearch.isError : overviewSearch.isError;
  const enabled = isFilteredMode ? filteredSearch.enabled : overviewSearch.enabled;

  return (
    <div>
      {/* Search input */}
      <div className="mb-6 flex items-center gap-2 rounded-full border border-border bg-muted px-4 h-11 text-sm">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("placeholder")}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          autoComplete="off"
          spellCheck={false}
          aria-label={t("ariaLabel")}
        />
        {isLoading && (
          <LoaderIcon
            className="size-4 shrink-0 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </div>

      {/* Filter bar — always visible */}
      <FilterBar
        type={activeType}
        filters={filters}
        onTypeChange={handleTypeChange}
        onFilterChange={handleFilterChange}
      />
      {isFilteredMode && (
        <ActiveChips
          type={activeType}
          filters={filters}
          onRemove={handleRemoveFilter}
          onClearAll={handleClearAllFilters}
        />
      )}

      {/* Results heading */}
      {enabled && (overviewSearch.data ?? filteredSearch.data) && (
        <h1 className="mb-6 text-lg font-semibold">
          {t("resultsPage.title", { query: query.trim() })}
        </h1>
      )}

      {/* Loading skeleton */}
      {isLoading && <SearchSkeleton />}

      {/* Error state */}
      {isError && !isLoading && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <AlertCircleIcon className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">{t("errorTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("errorHint")}</p>
        </div>
      )}

      {/* No results */}
      {enabled && !isLoading && !isError && !overviewHasResults && !filteredHasResults && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <SearchIcon className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">{t("noResults", { query: query.trim() })}</p>
          <p className={cn("text-sm text-muted-foreground")}>
            {t("noResultsHint", { discover: t("noResultsDiscoverLink") })}
          </p>
        </div>
      )}

      {/* Prompt to type */}
      {!enabled && query.trim().length > 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("minChars")}</p>
      )}

      {/* Overview mode: grouped sections */}
      {!isFilteredMode &&
        !isLoading &&
        !isError &&
        overviewHasResults &&
        overviewSearch
          .data!.sections.filter((s) => s.items.length > 0)
          .map((section) => (
            <ResultSectionCard key={section.type} section={section} onSeeAll={handleSeeAll} />
          ))}

      {/* Filtered mode: flat infinite list */}
      {isFilteredMode && !isLoading && !isError && filteredHasResults && (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden mb-4">
          {filteredSearch.allItems.map((item) => (
            <TypeCard key={`${item.type}-${item.id}`} item={item} />
          ))}
        </ul>
      )}

      {/* Infinite scroll trigger */}
      {isFilteredMode && filteredSearch.hasNextPage && (
        <InfiniteScrollSentinel
          onVisible={handleLoadMore}
          isLoading={filteredSearch.isFetchingNextPage}
        />
      )}

      {/* Loading more */}
      {isFilteredMode && filteredSearch.isFetchingNextPage && (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("loadingMore")}</p>
      )}

      {/* End of results */}
      {isFilteredMode &&
        enabled &&
        !filteredSearch.hasNextPage &&
        filteredHasResults &&
        !isLoading && (
          <p className="py-4 text-center text-xs text-muted-foreground">{t("endOfResults")}</p>
        )}
    </div>
  );
}
