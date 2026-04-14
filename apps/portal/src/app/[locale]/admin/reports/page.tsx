import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth } from "@igbo/auth";
import { getTranslations } from "next-intl/server";
import { listPostingsWithActiveReports } from "@igbo/db/queries/portal-posting-reports";
import { ReportsQueueTable } from "@/components/domain/reports-queue-table";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminReportsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();

  if (!session?.user || session.user.activePortalRole !== "JOB_ADMIN") {
    redirect(`/${locale}`);
    return null;
  }

  const t = await getTranslations("Portal.admin");

  const { items, total } = await listPostingsWithActiveReports({ limit: 100, offset: 0 });

  return (
    <main className="container mx-auto max-w-5xl px-4 py-8" data-testid="reports-queue-page">
      <h1 className="mb-2 text-2xl font-bold" data-testid="reports-queue-title">
        {t("reportsQueueTitle")}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">{t("reportsQueueSubtitle", { total })}</p>

      <ReportsQueueTable items={items} />
    </main>
  );
}
