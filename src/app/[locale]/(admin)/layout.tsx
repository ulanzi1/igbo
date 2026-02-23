import { setRequestLocale } from "next-intl/server";
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

  return <AdminShell>{children}</AdminShell>;
}
