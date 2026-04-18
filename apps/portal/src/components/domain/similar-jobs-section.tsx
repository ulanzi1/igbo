"use client";

import { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { JobResultCard, JobResultCardSkeleton } from "@/components/domain/job-result-card";
import { CompleteProfilePrompt } from "@/components/domain/complete-profile-prompt";
import { useSimilarJobs } from "@/hooks/use-similar-jobs";
import { useMatchScores } from "@/hooks/use-match-scores";

interface SimilarJobsSectionProps {
  jobId: string;
  isSeeker: boolean;
}

/**
 * Client component that loads and displays similar job postings for a given job.
 *
 * Loads client-side after hydration (non-blocking) via useSimilarJobs hook.
 * Shows match scores for authenticated seekers via useMatchScores hook.
 */
export function SimilarJobsSection({ jobId, isSeeker }: SimilarJobsSectionProps) {
  const t = useTranslations("Portal.jobDetail");
  const locale = useLocale();
  const { jobs, isLoading, error } = useSimilarJobs(jobId);
  const jobIds = useMemo(() => jobs.map((j) => j.id), [jobs]);
  const { scores, isLoading: matchLoading } = useMatchScores(jobIds, isSeeker);

  if (isLoading) {
    return (
      <div
        aria-busy="true"
        aria-label={t("similarJobsLoading")}
        data-testid="similar-jobs-section"
        className="space-y-3"
      >
        <JobResultCardSkeleton />
        <JobResultCardSkeleton />
        <JobResultCardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="similar-jobs-section" className="py-8 text-center text-muted-foreground">
        {t("similarJobsError")}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div
        data-testid="similar-jobs-section"
        className="py-8 text-center text-muted-foreground space-y-2"
      >
        <p>{t("similarJobsEmpty")}</p>
        <a href={`/${locale}/jobs`} className="text-sm font-medium text-primary hover:underline">
          {t("similarJobsBrowse")}
        </a>
      </div>
    );
  }

  const showCompleteProfilePrompt =
    isSeeker && !matchLoading && Object.keys(scores).length === 0 && jobs.length > 0;

  return (
    <div data-testid="similar-jobs-section" className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{t("similarJobsHeading")}</h2>
      {showCompleteProfilePrompt && <CompleteProfilePrompt />}
      {jobs.map((job) => (
        <JobResultCard
          key={job.id}
          item={job}
          queryHasValue={false}
          matchScore={scores[job.id] ?? null}
        />
      ))}
    </div>
  );
}
