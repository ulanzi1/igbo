import { setRequestLocale } from "next-intl/server";
import { redirect, notFound } from "next/navigation";
import { auth } from "@igbo/auth";
import { getTranslations } from "next-intl/server";
import { getReportsForPosting } from "@igbo/db/queries/portal-posting-reports";
import { getJobPostingById } from "@igbo/db/queries/portal-job-postings";
import { ReportInvestigationDetail } from "@/components/domain/report-investigation-detail";

interface PageProps {
  params: Promise<{ locale: string; postingId: string }>;
}

export default async function AdminReportDetailPage({ params }: PageProps) {
  const { locale, postingId } = await params;
  setRequestLocale(locale);

  const session = await auth();

  if (!session?.user || session.user.activePortalRole !== "JOB_ADMIN") {
    redirect(`/${locale}`);
    return null;
  }

  const [posting, reports] = await Promise.all([
    getJobPostingById(postingId),
    getReportsForPosting(postingId),
  ]);

  if (!posting) {
    notFound();
  }

  const t = await getTranslations("Portal.admin");

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8" data-testid="report-detail-page">
      <h1 className="mb-6 text-2xl font-bold">{t("reportsDetailTitle")}</h1>

      <ReportInvestigationDetail
        postingId={postingId}
        postingTitle={posting.title}
        reports={reports}
      />
    </main>
  );
}
