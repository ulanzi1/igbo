import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { BriefcaseIcon } from "lucide-react";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function JobsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Portal.nav");

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <BriefcaseIcon className="w-12 h-12 text-muted-foreground mb-4" aria-hidden="true" />
      <h1 className="text-2xl font-bold text-foreground mb-2">{t("browseAll")}</h1>
      <p className="text-muted-foreground">Job search and discovery is coming soon.</p>
    </div>
  );
}
