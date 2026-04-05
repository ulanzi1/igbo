import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireCompanyProfile } from "@/lib/require-company-profile";
import { getJobPostingWithCompany } from "@igbo/db/queries/portal-job-postings";
import { canEditPosting } from "@/services/job-posting-service";
import { JobPostingForm } from "@/components/flow/job-posting-form";

interface PageProps {
  params: Promise<{ locale: string; jobId: string }>;
}

export default async function JobPostingEditPage({ params }: PageProps) {
  const { locale, jobId } = await params;
  const t = await getTranslations("Portal");

  const company = await requireCompanyProfile(locale);
  if (!company) {
    redirect(`/${locale}`);
  }

  const result = await getJobPostingWithCompany(jobId);
  if (!result || result.posting.companyId !== company.id) {
    redirect(`/${locale}/my-jobs`);
  }

  const { posting } = result;

  // Block editing for pending_review, filled, expired
  if (!canEditPosting(posting.status)) {
    redirect(`/${locale}/my-jobs`);
  }

  return (
    <main id="main-content" className="container max-w-2xl py-8">
      <h1 className="mb-6 text-2xl font-bold">{t("posting.editTitle")}</h1>
      <JobPostingForm
        companyId={company.id}
        mode="edit"
        initialData={{
          id: posting.id,
          updatedAt: posting.updatedAt.toISOString(),
          status: posting.status,
          adminFeedbackComment: posting.adminFeedbackComment,
          title: posting.title,
          descriptionHtml: posting.descriptionHtml ?? "",
          requirements: posting.requirements ?? "",
          salaryMin: posting.salaryMin ?? null,
          salaryMax: posting.salaryMax ?? null,
          salaryCompetitiveOnly: posting.salaryCompetitiveOnly,
          location: posting.location ?? "",
          employmentType: posting.employmentType as
            | "full_time"
            | "part_time"
            | "contract"
            | "internship",
          applicationDeadline: posting.applicationDeadline
            ? posting.applicationDeadline.toISOString()
            : null,
          descriptionIgboHtml: posting.descriptionIgboHtml ?? "",
          culturalContextJson:
            (posting.culturalContextJson as {
              diasporaFriendly: boolean;
              igboLanguagePreferred: boolean;
              communityReferred: boolean;
            }) ?? null,
        }}
      />
    </main>
  );
}
