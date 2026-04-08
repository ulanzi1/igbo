import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth } from "@igbo/auth";
import { getTranslations } from "next-intl/server";
import { getReviewQueue, getDashboardSummary } from "@/services/admin-review-service";
import { AdminDashboardSummary } from "@/components/domain/admin-dashboard-summary";
import { ReviewQueueTable } from "@/components/domain/review-queue-table";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();

  if (!session?.user || session.user.activePortalRole !== "JOB_ADMIN") {
    redirect(`/${locale}`);
  }

  const t = await getTranslations("Portal.admin");

  const [queueResult, summary] = await Promise.all([
    getReviewQueue({ page: 1, pageSize: 20 }),
    getDashboardSummary(),
  ]);

  return (
    <main className="container mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">{t("reviewQueue")}</h1>

      <section aria-label={t("decisionBreakdown")} className="mb-8">
        <AdminDashboardSummary summary={summary} />
      </section>

      <section aria-label={t("reviewQueue")}>
        <ReviewQueueTable initialItems={queueResult.items} initialTotal={queueResult.total} />
      </section>
    </main>
  );
}
