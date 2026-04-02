import { getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/layout/AdminShell";
import { LeaderboardTable } from "@/features/admin/components/LeaderboardTable";

export default async function LeaderboardPage() {
  const t = await getTranslations("Admin");
  return (
    <div>
      <AdminPageHeader
        title={t("leaderboard.title")}
        breadcrumbs={[
          { label: t("sidebar.dashboard"), href: "/admin" },
          { label: t("leaderboard.title") },
        ]}
      />
      <div className="p-6">
        <LeaderboardTable />
      </div>
    </div>
  );
}
