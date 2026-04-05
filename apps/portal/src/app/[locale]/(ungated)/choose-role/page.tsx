import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth } from "@igbo/auth";
import { ChooseRoleForm } from "@/components/choose-role/choose-role-form";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Portal.chooseRole" });
  return { title: `${t("title")} — OBIGBO Job Portal` };
}

export default async function ChooseRolePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const portalRoles = ((session?.user as Record<string, unknown> | undefined)?.portalRoles ??
    []) as string[];

  // Already has roles → redirect to home (prevents re-entry)
  if (session && portalRoles.length > 0) {
    redirect(`/${locale}`);
  }

  // Unauthenticated → redirect to community login with returnTo
  if (!session) {
    const communityUrl = process.env.COMMUNITY_URL ?? "http://localhost:3000"; // ci-allow-process-env
    const portalUrl = process.env.PORTAL_PUBLIC_URL ?? "http://localhost:3001"; // ci-allow-process-env
    redirect(
      `${communityUrl}/login?callbackUrl=${encodeURIComponent(`${portalUrl}/${locale}/choose-role`)}`,
    );
  }

  return <ChooseRoleForm locale={locale} />;
}
