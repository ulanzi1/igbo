"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useGlobalSearch } from "../hooks/use-global-search";
import type { SearchSection, SearchResultItem } from "../hooks/use-global-search";
import { SearchIcon, LoaderIcon, AlertCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function SearchResultsContent({ initialQuery }: { initialQuery: string }) {
  const t = useTranslations("GlobalSearch");
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  const { data, isLoading, isError, enabled } = useGlobalSearch(query);

  const hasResults = data && data.sections.some((s) => s.items.length > 0);

  const handleSeeAll = useCallback(
    (type: string) => {
      router.push({ pathname: "/search", query: { q: query.trim(), type } } as Parameters<
        typeof router.push
      >[0]);
    },
    [query, router],
  );

  return (
    <div>
      {/* Search input */}
      <div className="mb-8 flex items-center gap-2 rounded-full border border-border bg-muted px-4 h-11 text-sm">
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

      {/* Results heading */}
      {enabled && data && (
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
      {enabled && !isLoading && !isError && !hasResults && (
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

      {/* Result sections */}
      {!isLoading &&
        !isError &&
        hasResults &&
        data.sections
          .filter((s) => s.items.length > 0)
          .map((section) => (
            <ResultSectionCard key={section.type} section={section} onSeeAll={handleSeeAll} />
          ))}
    </div>
  );
}
