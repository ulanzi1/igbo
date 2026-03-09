import { getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/layout/AdminShell";
import { GamificationRulesManager } from "@/features/admin/components/GamificationRulesManager";

export default async function GamificationPage() {
  const t = await getTranslations("Admin");
  return (
    <div>
      <AdminPageHeader
        title={t("gamification.title")}
        breadcrumbs={[
          { label: t("sidebar.dashboard"), href: "/admin" },
          { label: t("gamification.title") },
        ]}
      />
      <div className="p-6">
        <GamificationRulesManager />
      </div>
    </div>
  );
}
