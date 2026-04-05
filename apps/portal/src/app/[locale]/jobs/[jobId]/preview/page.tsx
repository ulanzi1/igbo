import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireCompanyProfile } from "@/lib/require-company-profile";
import { getJobPostingWithCompany } from "@igbo/db/queries/portal-job-postings";
import { JobPostingPreview } from "@/components/flow/job-posting-preview";

interface PageProps {
  params: Promise<{ locale: string; jobId: string }>;
}

export default async function JobPostingPreviewPage({ params }: PageProps) {
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
  const isDraft = posting.status === "draft";

  return (
    <main id="main-content" className="container max-w-2xl py-8">
      <div className="mb-6">
        <h1 className="sr-only">{t("lifecycle.previewBanner")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(`posting.status.${posting.status}`)} &mdash; {posting.title}
        </p>
      </div>
      <JobPostingPreview posting={posting} company={result.company} isDraft={isDraft} />
    </main>
  );
}
