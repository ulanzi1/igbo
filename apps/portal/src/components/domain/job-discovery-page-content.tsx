"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { SearchIcon, XIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { JobResultCard } from "@/components/domain/job-result-card";
import { CategoryCard } from "@/components/domain/category-card";
import { useMatchScores } from "@/hooks/use-match-scores";
import type { DiscoveryJobResult, IndustryCategoryCount } from "@igbo/db/queries/portal-job-search";
import type { JobSearchResultItem } from "@/lib/validations/job-search";

interface JobDiscoveryPageContentProps {
  featuredJobs: DiscoveryJobResult[];
  categories: IndustryCategoryCount[];
  recentPostings: DiscoveryJobResult[];
}

/**
 * Converts a DiscoveryJobResult (DB shape) to a JobSearchResultItem (UI shape)
 * suitable for JobResultCard. Relevance and snippet are null (not applicable on discovery page).
 */
function toResultItem(row: DiscoveryJobResult): JobSearchResultItem {
  return {
    id: row.id,
    title: row.title,
    companyName: row.company_name ?? "",
    companyId: row.company_id,
    companyLogoUrl: row.logo_url,
    location: row.location,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    salaryCompetitiveOnly: row.salary_competitive_only,
    employmentType: row.employment_type as JobSearchResultItem["employmentType"],
    culturalContext: row.cultural_context_json as JobSearchResultItem["culturalContext"],
    applicationDeadline: row.application_deadline,
    createdAt: row.created_at,
    relevance: null,
    snippet: null,
  };
}

export function JobDiscoveryPageContent({
  featuredJobs,
  categories,
  recentPostings,
}: JobDiscoveryPageContentProps) {
  const t = useTranslations("Portal.discovery");
  const tSearch = useTranslations("Portal.search");
  const locale = useLocale();
  const router = useRouter();
  const [searchValue, setSearchValue] = useState("");
  const { data: session } = useSession();

  const isSeeker = session?.user?.activePortalRole === "JOB_SEEKER";
  const allJobIds = useMemo(
    () => [...featuredJobs, ...recentPostings].map((j) => j.id),
    [featuredJobs, recentPostings],
  );
  const { scores } = useMatchScores(allJobIds, isSeeker);

  const allEmpty =
    featuredJobs.length === 0 && categories.length === 0 && recentPostings.length === 0;

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = searchValue.trim();
    if (trimmed) {
      router.push(`/${locale}/search?q=${encodeURIComponent(trimmed)}`);
    } else {
      router.push(`/${locale}/search`);
    }
  }

  return (
    <main className="container mx-auto max-w-5xl px-4 py-8">
      {/* Page heading */}
      <h1 className="text-3xl font-bold text-foreground mb-2">{t("heading")}</h1>

      {/* Search bar */}
      <form
        onSubmit={handleSearchSubmit}
        role="search"
        aria-label={t("searchAriaLabel")}
        className="relative mt-4 mb-10"
      >
        <div className="relative flex items-center">
          <SearchIcon
            className="absolute left-3 size-5 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-10 pr-10 h-12 text-base"
            aria-label={t("searchAriaLabel")}
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => setSearchValue("")}
              aria-label={tSearch("clearSearchAriaLabel")}
              className="absolute right-3 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </form>

      {/* Cold start empty state — all sections empty */}
      {allEmpty && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <p className="text-xl font-semibold text-foreground">
            {tSearch("empty.coldStart.title")}
          </p>
          <p className="text-muted-foreground">{tSearch("empty.coldStart.body")}</p>
          <Button asChild variant="outline">
            <a href={`/${locale}/search`}>{t("browseAllJobs")}</a>
          </Button>
        </div>
      )}

      {/* Featured Jobs section */}
      {featuredJobs.length > 0 && (
        <section aria-labelledby="featured-heading" className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 id="featured-heading" className="text-xl font-semibold text-foreground">
              {t("featuredHeading")}
            </h2>
            <a
              href={`/${locale}/search`}
              className="text-sm font-medium text-primary hover:underline"
            >
              {t("featuredViewAll")}
            </a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {featuredJobs.map((job) => (
              <JobResultCard
                key={job.id}
                item={toResultItem(job)}
                queryHasValue={false}
                matchScore={scores[job.id] ?? null}
              />
            ))}
          </div>
        </section>
      )}

      {/* Browse by Category section */}
      {categories.length > 0 && (
        <section aria-labelledby="categories-heading" className="mb-12">
          <h2 id="categories-heading" className="text-xl font-semibold text-foreground mb-4">
            {t("categoriesHeading")}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {categories.map(({ industry, count }) => (
              <CategoryCard key={industry} industry={industry} count={count} />
            ))}
          </div>
        </section>
      )}

      {/* Recent Postings section */}
      {recentPostings.length > 0 && (
        <section aria-labelledby="recent-heading" className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 id="recent-heading" className="text-xl font-semibold text-foreground">
              {t("recentHeading")}
            </h2>
            <a
              href={`/${locale}/search`}
              className="text-sm font-medium text-primary hover:underline"
            >
              {t("recentViewAll")}
            </a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {recentPostings.map((job) => (
              <JobResultCard
                key={job.id}
                item={toResultItem(job)}
                queryHasValue={false}
                matchScore={scores[job.id] ?? null}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
