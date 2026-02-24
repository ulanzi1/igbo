import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { MemberManagement } from "@/features/admin";

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

  return <MemberManagement />;
}
