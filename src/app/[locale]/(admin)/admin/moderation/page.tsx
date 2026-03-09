import { getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/layout/AdminShell";
import { ModerationQueue } from "@/features/admin/components/ModerationQueue";

export default async function ModerationPage() {
  const t = await getTranslations("Admin");
  return (
    <div>
      <AdminPageHeader
        title={t("moderation.title")}
        breadcrumbs={[
          { label: t("sidebar.dashboard"), href: "/admin" },
          { label: t("sidebar.moderation") },
        ]}
      />
      <div className="p-6">
        <ModerationQueue />
      </div>
    </div>
  );
}
