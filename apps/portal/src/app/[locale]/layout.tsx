import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { routing } from "@/i18n/routing";
import { auth } from "@igbo/auth";
import { SkipLink } from "@/components/layout/skip-link";
import { Toaster } from "@/components/ui/sonner";
import { DensityProvider, ROLE_DENSITY_DEFAULTS } from "@/providers/density-context";

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

  const activeRole = (session?.user as { activePortalRole?: string } | undefined)?.activePortalRole;
  const defaultDensity = ROLE_DENSITY_DEFAULTS[activeRole ?? ""] ?? "comfortable";

  return (
    <SessionProvider session={session}>
      <DensityProvider defaultDensity={defaultDensity}>
        <NextIntlClientProvider>
          <SkipLink href="#main-content" />
          {children}
          <Toaster />
        </NextIntlClientProvider>
      </DensityProvider>
    </SessionProvider>
  );
}
