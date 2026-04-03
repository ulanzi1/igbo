import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { routing } from "@/i18n/routing";
import { auth } from "@igbo/auth";
import { PortalLayout } from "@/components/layout/portal-layout";
import { SkipLink } from "@/components/layout/skip-link";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const session = await auth();

  return (
    <SessionProvider session={session}>
      <NextIntlClientProvider>
        <SkipLink href="#main-content" />
        <PortalLayout>{children}</PortalLayout>
      </NextIntlClientProvider>
    </SessionProvider>
  );
}
