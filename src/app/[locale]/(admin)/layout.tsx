import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { auth } from "@/server/auth/config";
import { AdminShell } from "@/components/layout/AdminShell";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/${locale}/login`);
  }
  if (session.user.role !== "ADMIN") {
    redirect(`/${locale}/dashboard`);
  }

  return <AdminShell>{children}</AdminShell>;
}
