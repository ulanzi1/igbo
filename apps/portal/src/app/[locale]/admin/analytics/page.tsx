import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth } from "@igbo/auth";
import { getTranslations, getFormatter } from "next-intl/server";
import { getPlatformAnalytics } from "@/services/admin-analytics-service";
import { AdminAnalyticsDashboard } from "@/components/domain/admin-analytics-dashboard";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminAnalyticsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user || session.user.activePortalRole !== "JOB_ADMIN") {
    redirect(`/${locale}`);
    return null;
  }

  const t = await getTranslations("Portal.admin");
  const format = await getFormatter();

  const analytics = await getPlatformAnalytics();

  const formattedDate = format.dateTime(new Date(analytics.generatedAt), {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <main className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{t("analyticsTitle")}</h1>
        <p className="text-muted-foreground">{t("analyticsSubtitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("lastUpdated")}: {formattedDate}
        </p>
      </div>

      <AdminAnalyticsDashboard analytics={analytics} />
    </main>
  );
}
