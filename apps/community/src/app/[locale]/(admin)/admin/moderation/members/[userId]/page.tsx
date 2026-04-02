import { getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/layout/AdminShell";
import { MemberDisciplineHistory } from "@/features/admin/components/MemberDisciplineHistory";

interface PageProps {
  params: Promise<{ userId: string }>;
}

export default async function MemberDisciplinePage({ params }: PageProps) {
  const { userId } = await params;
  const t = await getTranslations("Admin");
  return (
    <div>
      <AdminPageHeader
        title={t("discipline.title")}
        breadcrumbs={[
          { label: t("sidebar.dashboard"), href: "/admin" },
          { label: t("sidebar.moderation"), href: "/admin/moderation" },
          { label: t("discipline.title") },
        ]}
      />
      <div className="p-6">
        <MemberDisciplineHistory userId={userId} />
      </div>
    </div>
  );
}
