import { getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/layout/AdminShell";
import { ModerationQueue } from "@/features/admin/components/ModerationQueue";
import { Link } from "@/i18n/navigation";

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
        <div className="flex justify-end mb-4">
          <Link
            href="/admin/moderation/keywords"
            className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700 hover:text-white transition-colors"
          >
            {t("moderation.keywords.title")}
          </Link>
        </div>
        <ModerationQueue />
      </div>
    </div>
  );
}
