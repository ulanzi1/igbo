import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { requireCompanyProfile } from "@/lib/require-company-profile";
import { getJobPostingWithCompany, getJobAnalytics } from "@igbo/db/queries/portal-job-postings";
import { JobAnalyticsCard, JobAnalyticsCardSkeleton } from "@/components/domain/job-analytics-card";
import { ShareToCommunityButton } from "@/components/domain/share-to-community-button";
import type { PortalJobStatus } from "@igbo/db/schema/portal-job-postings";

interface PageProps {
  params: Promise<{ locale: string; jobId: string }>;
}

export default async function EmployerJobDetailPage({ params }: PageProps) {
  const { locale, jobId } = await params;
  const t = await getTranslations("Portal.analytics");
  const pt = await getTranslations("Portal.posting");
  const jt = await getTranslations("Portal.jobDetail");

  const company = await requireCompanyProfile(locale);
  if (!company) {
    redirect(`/${locale}`);
  }

  const result = await getJobPostingWithCompany(jobId);
  if (!result || result.posting.companyId !== company.id) {
    redirect(`/${locale}/my-jobs`);
  }

  const { posting } = result;
  const analytics = await getJobAnalytics(jobId);

  const isActive = posting.status === "active";
  const isShared = analytics?.communityPostId != null;
  const applicationCount = analytics?.applicationCount ?? 0;
  const ats = await getTranslations("Portal.ats");

  return (
    <div className="max-w-3xl py-8">
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/${locale}/my-jobs`} className="hover:text-foreground">
          {jt("myJobs")}
        </Link>
        <span aria-hidden="true">/</span>
        <span>{posting.title}</span>
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{posting.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {pt(`status.${posting.status as PortalJobStatus}`)} &middot;{" "}
            {posting.location ?? jt("remote")} &middot;{" "}
            {pt(`employmentType.${posting.employmentType}`)}
          </p>
        </div>
        <Link
          href={`/${locale}/jobs/${jobId}/edit`}
          className="shrink-0 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
        >
          {jt("edit")}
        </Link>
      </div>

      <section aria-labelledby="analytics-heading" className="mb-6">
        <h2 id="analytics-heading" className="mb-3 text-lg font-semibold">
          {t("sectionHeading")}
        </h2>
        {analytics ? (
          <JobAnalyticsCard
            analytics={{
              views: analytics.viewCount,
              applications: analytics.applicationCount,
              conversionRate: analytics.conversionRate,
              sharedToCommunity: isShared,
            }}
          />
        ) : (
          <JobAnalyticsCardSkeleton />
        )}
      </section>

      <section aria-labelledby="share-heading" className="mb-6">
        <h2 id="share-heading" className="mb-3 text-lg font-semibold">
          {t("shareButton")}
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">{t("shareDescription")}</p>
        <ShareToCommunityButton jobId={jobId} isActive={isActive} isShared={isShared} />
      </section>

      <section aria-labelledby="candidates-heading" className="mb-6">
        <h2 id="candidates-heading" className="mb-3 text-lg font-semibold">
          {ats("pageTitle")}
        </h2>
        <Link
          href={`/${locale}/my-jobs/${jobId}/candidates`}
          className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          data-testid="view-candidates-link"
          data-application-count={applicationCount}
        >
          <Users className="size-4" aria-hidden="true" />
          {ats("viewCandidatesWithCount", { count: applicationCount })}
        </Link>
      </section>
    </div>
  );
}
