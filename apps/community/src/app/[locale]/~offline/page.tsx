import { WifiOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/shared/EmptyState";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function OfflinePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <OfflineContent />;
}

function OfflineContent() {
  const t = useTranslations("Errors");
  const tCommon = useTranslations("Common");

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center">
      <EmptyState
        icon={<WifiOffIcon className="size-8" aria-hidden="true" />}
        title={t("offline")}
        description={t("offlineDescription")}
        primaryAction={{ label: tCommon("tryAgain"), href: "/" }}
      />
    </main>
  );
}
