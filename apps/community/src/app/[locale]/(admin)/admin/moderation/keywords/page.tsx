import { getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/layout/AdminShell";
import { KeywordManager } from "@/features/admin/components/KeywordManager";

export default async function KeywordsPage() {
  const t = await getTranslations("Admin");
  return (
    <div>
      <AdminPageHeader
        title={t("moderation.keywords.title")}
        breadcrumbs={[
          { label: t("sidebar.dashboard"), href: "/admin" },
          { label: t("sidebar.moderation"), href: "/admin/moderation" },
          { label: t("moderation.keywords.title") },
        ]}
      />
      <div className="p-6">
        <KeywordManager />
      </div>
    </div>
  );
}
