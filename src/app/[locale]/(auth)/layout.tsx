import { setRequestLocale } from "next-intl/server";
import { AuthQueryProvider } from "./AuthQueryProvider";

export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AuthQueryProvider>{children}</AuthQueryProvider>;
}
