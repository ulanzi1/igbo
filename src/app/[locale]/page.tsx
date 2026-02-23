import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <HomeContent />;
}

function HomeContent() {
  const tShell = useTranslations("Shell");

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-semibold">{tShell("appName")}</h1>
    </main>
  );
}
