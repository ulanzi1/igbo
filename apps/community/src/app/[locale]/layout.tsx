import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/sonner";
import { routing } from "@/i18n/routing";
import { auth } from "@/server/auth/config";
import { CookieConsentBanner } from "@/components/shared/CookieConsentBanner";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

function SkipLink() {
  const t = useTranslations("Shell");
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md"
    >
      {t("skipToContent")}
    </a>
  );
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
        <SkipLink />
        {children}
        <Toaster />
        <CookieConsentBanner />
      </NextIntlClientProvider>
    </SessionProvider>
  );
}
