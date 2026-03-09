import { getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/layout/AdminShell";
import { GovernanceManager } from "@/features/admin/components/GovernanceManager";

export default async function GovernancePage() {
  const t = await getTranslations("Admin");
  return (
    <div>
      <AdminPageHeader
        title={t("governance.title")}
        breadcrumbs={[
          { label: t("sidebar.dashboard"), href: "/admin" },
          { label: t("governance.title") },
        ]}
      />
      <div className="p-6">
        <GovernanceManager />
      </div>
    </div>
  );
}
