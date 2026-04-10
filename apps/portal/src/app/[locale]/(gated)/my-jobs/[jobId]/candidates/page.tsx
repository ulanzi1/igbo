import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompanyProfile } from "@/lib/require-company-profile";
import { getJobPostingById } from "@igbo/db/queries/portal-job-postings";
import { getApplicationsWithSeekerDataByJobId } from "@igbo/db/queries/portal-applications";
import { AtsPipelineView } from "@/components/flow/ats-pipeline-view";
import type { KanbanApplication } from "@/components/domain/ats-kanban-board";

interface PageProps {
  params: Promise<{ locale: string; jobId: string }>;
}

export default async function CandidatesPage({ params }: PageProps) {
  const { locale, jobId } = await params;
  const t = await getTranslations("Portal.ats");

  const company = await requireCompanyProfile(locale);
  if (!company) {
    redirect(`/${locale}`);
  }

  const posting = await getJobPostingById(jobId);
  if (!posting || posting.companyId !== company.id) {
    redirect(`/${locale}/my-jobs`);
  }

  const rawApplications = await getApplicationsWithSeekerDataByJobId(jobId);

  const applications: KanbanApplication[] = rawApplications.map((app) => ({
    id: app.id,
    seekerName: app.seekerName ?? "",
    seekerHeadline: app.seekerHeadline ?? null,
    status: app.status,
    seekerProfileId: app.seekerProfileId ?? null,
    seekerSkills: app.seekerSkills ?? [],
    createdAt: app.createdAt,
    coverLetterText: app.coverLetterText ?? null,
    portfolioLinksJson: app.portfolioLinksJson ?? [],
    selectedCvId: app.selectedCvId ?? null,
  }));

  return (
    <div className="py-6">
      {/* Breadcrumbs */}
      <nav
        aria-label="breadcrumb"
        className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"
      >
        <Link href={`/${locale}/my-jobs`} className="hover:text-foreground">
          {t("breadcrumbMyJobs")}
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={`/${locale}/my-jobs/${jobId}`} className="hover:text-foreground">
          {posting.title}
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{t("pageTitle")}</span>
      </nav>

      {/* Title */}
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold">{t("pageTitle")}</h1>
        <span className="text-sm text-muted-foreground">
          {t("candidateCount", { count: applications.length })}
        </span>
      </div>

      {/* Pipeline */}
      <AtsPipelineView applications={applications} />
    </div>
  );
}
