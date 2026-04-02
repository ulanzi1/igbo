import { getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/layout/AdminShell";
import { MemberPointsInvestigator } from "@/features/admin/components/MemberPointsInvestigator";

export default async function MemberPointsPage() {
  const t = await getTranslations("Admin");
  return (
    <div>
      <AdminPageHeader
        title={t("memberPoints.title")}
        breadcrumbs={[
          { label: t("sidebar.dashboard"), href: "/admin" },
          { label: t("sidebar.members"), href: "/admin/members" },
          { label: t("memberPoints.title") },
        ]}
      />
      <div className="p-6">
        <MemberPointsInvestigator />
      </div>
    </div>
  );
}
