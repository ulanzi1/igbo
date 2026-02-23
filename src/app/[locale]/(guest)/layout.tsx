import { setRequestLocale } from "next-intl/server";
import { GuestShell } from "@/components/layout/GuestShell";

export default async function GuestLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <GuestShell>{children}</GuestShell>;
}
