import { setRequestLocale } from "next-intl/server";
import { auth } from "@igbo/auth";
import { redirect } from "next/navigation";
import { PortalLayout } from "@/components/layout/portal-layout";

export default async function GatedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const portalRoles = ((session?.user as Record<string, unknown> | undefined)?.portalRoles ??
    []) as string[];

  // Authenticated user with no portal roles → redirect to Choose Your Path
  if (session && portalRoles.length === 0) {
    redirect(`/${locale}/choose-role`);
  }

  // Unauthenticated (guest) or has roles → render normally
  return <PortalLayout>{children}</PortalLayout>;
}
