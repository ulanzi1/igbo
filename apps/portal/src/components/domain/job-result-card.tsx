"use client";

import { useTranslations, useLocale } from "next-intl";
import { MapPinIcon, BriefcaseIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SalaryDisplay } from "@/components/semantic/salary-display";
import { CulturalContextBadges } from "@/components/semantic/cultural-context-badges";
import { formatDeadlineCountdown } from "@/lib/format-deadline-countdown";
import { formatPostingAge } from "@/lib/format-posting-age";
import { sanitizeSearchSnippet } from "@/lib/sanitize-search-snippet";
import { MatchPill } from "@/components/domain/match-pill";
import type { JobSearchResultItem } from "@/lib/validations/job-search";
import type { MatchScoreResult } from "@igbo/config";

interface JobResultCardProps {
  item: JobSearchResultItem;
  /** Whether the user has typed a query (controls snippet rendering) */
  queryHasValue: boolean;
  /** Optional match score — shown inline after meta line when present and tier !== "none" */
  matchScore?: MatchScoreResult | null;
}

export function JobResultCard({ item, queryHasValue, matchScore }: JobResultCardProps) {
  const t = useTranslations("Portal.search");
  const tPosting = useTranslations("Portal.posting");
  const locale = useLocale();

  const deadline = formatDeadlineCountdown(item.applicationDeadline, locale);
  const postingAge = formatPostingAge(item.createdAt, locale);

  const employmentTypeLabel = (() => {
    try {
      return tPosting(`type.${item.employmentType}`);
    } catch {
      return item.employmentType;
    }
  })();

  return (
    <article
      data-testid="job-result-card"
      className="rounded-lg border border-border bg-card p-4 hover:shadow-sm transition-shadow"
    >
      {/* Header: logo + company + title */}
      <div className="flex items-start gap-3">
        {/* Company logo / avatar fallback */}
        <div className="flex-shrink-0">
          {item.companyLogoUrl ? (
            <img
              src={item.companyLogoUrl}
              alt={item.companyName}
              className="size-10 rounded-md object-cover border border-border"
            />
          ) : (
            <div
              aria-hidden="true"
              className="size-10 rounded-md bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground"
            >
              {item.companyName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Job title — links to detail page */}
          <h2 className="font-semibold text-base leading-tight">
            <a
              href={`/${locale}/jobs/${item.id}`}
              className="hover:underline text-foreground"
              aria-label={item.title}
            >
              {item.title}
            </a>
          </h2>

          {/* Company name — linked when companyId is available */}
          {item.companyId ? (
            <a
              href={`/${locale}/companies/${item.companyId}`}
              aria-label={t("card.companyNameAriaLabel", { name: item.companyName })}
              className="text-sm text-muted-foreground hover:underline"
            >
              {item.companyName}
            </a>
          ) : (
            <span
              aria-label={t("card.companyNameAriaLabel", { name: item.companyName })}
              className="text-sm text-muted-foreground"
            >
              {item.companyName}
            </span>
          )}
        </div>
      </div>

      {/* Meta: location, employment type, salary */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {item.location && (
          <span className="flex items-center gap-1">
            <MapPinIcon className="size-3.5 shrink-0" aria-hidden="true" />
            {item.location}
          </span>
        )}
        <span className="flex items-center gap-1">
          <BriefcaseIcon className="size-3.5 shrink-0" aria-hidden="true" />
          {employmentTypeLabel}
        </span>
        {(item.salaryMin != null || item.salaryMax != null || item.salaryCompetitiveOnly) && (
          <span>
            <SalaryDisplay
              min={item.salaryMin}
              max={item.salaryMax}
              competitiveOnly={item.salaryCompetitiveOnly}
            />
          </span>
        )}
      </div>

      {/* Cultural context badges */}
      {item.culturalContext && (
        <CulturalContextBadges culturalContext={item.culturalContext as Record<string, boolean>} />
      )}

      {/* Match pill — only for authenticated seekers with consent (matchScore provided by parent) */}
      {matchScore && matchScore.tier !== "none" && (
        <div className="mt-2 min-h-[20px]">
          <MatchPill matchScore={matchScore} />
        </div>
      )}

      {/* Posting age + deadline */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {/* Posting age */}
        {postingAge.variant === "relative" ? (
          <span>{t("card.postingAgeRelative", { days: postingAge.days })}</span>
        ) : (
          <span>{t("card.postingAgeAbsolute", { date: postingAge.date })}</span>
        )}

        {/* Deadline countdown */}
        {deadline && (
          <span
            className={cn(
              deadline.severity === "critical" && "text-red-600 font-medium",
              deadline.severity === "warning" && "text-amber-600 font-medium",
            )}
          >
            {deadline.variant === "today" && t("card.deadlineToday")}
            {deadline.variant === "inDays" &&
              t("card.deadlineInDays", { days: deadline.days ?? 0 })}
            {deadline.variant === "absolute" &&
              t("card.deadlineAbsolute", { date: deadline.date ?? "" })}
          </span>
        )}
      </div>

      {/* Search snippet — only when query is present AND snippet is non-null */}
      {queryHasValue && item.snippet && (
        <p
          className="mt-2 text-sm text-muted-foreground line-clamp-2 [&>mark]:bg-yellow-100 [&>mark]:text-foreground [&>mark]:rounded-sm [&>mark]:px-0.5"
          // ci-allow-unsanitized-html: sanitized via sanitizeSearchSnippet — <mark>-only allow-list for ts_headline output (see P-4.1A AC #6)
          dangerouslySetInnerHTML={{ __html: sanitizeSearchSnippet(item.snippet) }}
        />
      )}

      {/* View details link */}
      <div className="mt-3">
        <a
          href={`/${locale}/jobs/${item.id}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          {t("card.viewDetails")}
        </a>
      </div>
    </article>
  );
}

export function JobResultCardSkeleton() {
  return (
    <div
      data-testid="job-result-card-skeleton"
      className="rounded-lg border border-border bg-card p-4 animate-pulse"
    >
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-md bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 bg-muted rounded" />
          <div className="h-3 w-1/3 bg-muted rounded" />
        </div>
      </div>
      <div className="mt-3 flex gap-4">
        <div className="h-3 w-24 bg-muted rounded" />
        <div className="h-3 w-20 bg-muted rounded" />
      </div>
      <div className="mt-3 flex gap-3">
        <div className="h-3 w-16 bg-muted rounded" />
        <div className="h-3 w-24 bg-muted rounded" />
      </div>
    </div>
  );
}
