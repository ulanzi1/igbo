import { getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/layout/AdminShell";
import { AnalyticsDashboard } from "@/features/admin/components/AnalyticsDashboard";

export default async function AnalyticsPage() {
  const t = await getTranslations("Admin");
  return (
    <div>
      <AdminPageHeader
        title={t("analytics.title")}
        breadcrumbs={[
          { label: t("sidebar.dashboard"), href: "/admin" },
          { label: t("sidebar.analytics") },
        ]}
      />
      <div className="p-6">
        <AnalyticsDashboard />
      </div>
    </div>
  );
}
