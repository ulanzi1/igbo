import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompanyProfile } from "@/lib/require-company-profile";
import { getJobPostingWithCompany } from "@igbo/db/queries/portal-job-postings";
import { getApplicationsWithSeekerDataByJobId } from "@igbo/db/queries/portal-applications";
import { AtsPipelineView } from "@/components/flow/ats-pipeline-view";
import { ExportCandidatesButton } from "@/components/domain/export-candidates-button";
import type { KanbanApplication } from "@/components/domain/candidate-card";

interface PageProps {
  params: Promise<{ locale: string; jobId: string }>;
}

export default async function AtsCandidatesPage({ params }: PageProps) {
  const { locale, jobId } = await params;
  const t = await getTranslations("Portal.ats");

  const company = await requireCompanyProfile(locale);
  if (!company) {
    redirect(`/${locale}`);
  }

  const result = await getJobPostingWithCompany(jobId);
  if (!result || result.posting.companyId !== company.id) {
    redirect(`/${locale}/my-jobs`);
  }

  const { posting } = result;
  const rawApplications = await getApplicationsWithSeekerDataByJobId(jobId);
  const applications: KanbanApplication[] = rawApplications;

  return (
    <div className="max-w-[100rem] py-6" data-testid="ats-candidates-page">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/${locale}/my-jobs`} className="hover:text-foreground">
          {t("breadcrumbMyJobs")}
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={`/${locale}/my-jobs/${jobId}`} className="hover:text-foreground">
          {posting.title}
        </Link>
        <span aria-hidden="true">/</span>
        <span>{t("pageTitle")}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("pageTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("candidateCount", { count: applications.length })}
          </p>
        </div>
        <ExportCandidatesButton jobId={jobId} applicationCount={applications.length} />
      </div>

      <AtsPipelineView applications={applications} />
    </div>
  );
}
