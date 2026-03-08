import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { MemberManagement } from "@/features/admin";
import { AdminPageHeader } from "@/components/layout/AdminShell";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.members" });
  return { title: t("title") };
}

export default async function MembersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Admin");

  return (
    <>
      <AdminPageHeader
        title={t("members.title")}
        breadcrumbs={[
          { label: t("sidebar.dashboard"), href: "/admin" },
          { label: t("sidebar.members") },
        ]}
      />
      <MemberManagement />
    </>
  );
}
