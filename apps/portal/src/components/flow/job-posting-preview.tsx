"use client";

import { useTranslations } from "next-intl";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { SalaryDisplay } from "@/components/semantic/salary-display";
import { CulturalContextBadges } from "@/components/semantic/cultural-context-badges";
import { JobDescriptionDisplay } from "@/components/semantic/job-description-display";
import type { PortalJobPosting } from "@igbo/db/schema/portal-job-postings";
import type { PortalCompanyProfile } from "@igbo/db/schema/portal-company-profiles";

interface JobPostingPreviewProps {
  posting: PortalJobPosting;
  company: PortalCompanyProfile;
  isDraft: boolean;
}

export function JobPostingPreview({ posting, company, isDraft }: JobPostingPreviewProps) {
  const t = useTranslations("Portal");

  const companyInitial = company.name.charAt(0).toUpperCase();

  const deadline = posting.applicationDeadline
    ? new Date(posting.applicationDeadline).toLocaleDateString("en-NG", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <article className="space-y-6">
      {isDraft && (
        <div
          role="alert"
          className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm font-medium text-yellow-800"
          data-testid="preview-banner"
        >
          {t("lifecycle.previewBanner")}
        </div>
      )}

      {/* Company info */}
      <div className="flex items-center gap-3">
        <Avatar size="lg">
          {company.logoUrl ? <AvatarImage src={company.logoUrl} alt={company.name} /> : null}
          <AvatarFallback>{companyInitial}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold">{company.name}</p>
          {company.industry && <p className="text-sm text-muted-foreground">{company.industry}</p>}
        </div>
      </div>

      {/* Title + status badge */}
      <div>
        <h1 className="text-2xl font-bold">{posting.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          {posting.employmentType && (
            <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
              {t(`posting.type.${posting.employmentType}`)}
            </span>
          )}
          {posting.location && (
            <span className="text-sm text-muted-foreground">{posting.location}</span>
          )}
        </div>
      </div>

      {/* Salary */}
      <SalaryDisplay
        min={posting.salaryMin ?? null}
        max={posting.salaryMax ?? null}
        competitiveOnly={posting.salaryCompetitiveOnly}
      />

      {/* Cultural context */}
      <CulturalContextBadges culturalContext={posting.culturalContextJson ?? null} />

      {/* Description */}
      {posting.descriptionHtml && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">{t("posting.description")}</h2>
          <JobDescriptionDisplay
            descriptionHtml={posting.descriptionHtml}
            descriptionIgboHtml={posting.descriptionIgboHtml}
          />
        </section>
      )}

      {/* Requirements */}
      {posting.requirements && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">{t("posting.requirements")}</h2>
          <div
            className="prose prose-sm max-w-none"
            // ci-allow-unsanitized-html — preview only; requirements sanitized on the public job page
            dangerouslySetInnerHTML={{ __html: posting.requirements }}
          />
        </section>
      )}

      {/* Application deadline */}
      {deadline && (
        <p className="text-sm text-muted-foreground">
          {t("posting.applicationDeadline")}: {deadline}
        </p>
      )}
    </article>
  );
}

export function JobPostingPreviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-10 w-full animate-pulse rounded bg-muted" />
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 animate-pulse rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-20 w-full animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
