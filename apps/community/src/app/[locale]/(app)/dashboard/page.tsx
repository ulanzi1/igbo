import { setRequestLocale, getTranslations } from "next-intl/server";
import { auth } from "@/server/auth/config";
import { redirect } from "@/i18n/navigation";
import { DashboardShell } from "@/features/dashboard";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Dashboard" });
  return { title: t("pageTitle") };
}

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: "/login", locale });
    return null;
  }

  const displayName = session.user.name ?? "";
  const avatarUrl = session.user.image ?? null;

  return <DashboardShell displayName={displayName} avatarUrl={avatarUrl} />;
}
