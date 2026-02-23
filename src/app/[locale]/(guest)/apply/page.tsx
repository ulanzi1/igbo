import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { MailIcon } from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "SEO" });

  return {
    title: t("applyTitle"),
    description: t("applyDescription"),
    alternates: {
      canonical: `/${locale}/apply`,
      languages: {
        en: "/en/apply",
        ig: "/ig/apply",
      },
    },
    openGraph: {
      title: t("applyTitle"),
      description: t("applyDescription"),
      type: "website",
    },
    twitter: {
      card: "summary",
      title: t("applyTitle"),
      description: t("applyDescription"),
    },
  };
}

export default async function ApplyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Apply");

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 md:py-16 text-center">
      <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">{t("heading")}</h1>
      <p className="text-base text-muted-foreground mb-8">{t("description")}</p>

      <div className="rounded-xl bg-muted p-8 mb-8">
        <p className="text-base text-foreground mb-4">{t("contactInfo")}</p>
        <div className="flex items-center justify-center gap-2 text-primary font-medium">
          <MailIcon className="size-5" aria-hidden="true" />
          <span>{t("emailLabel")}</span>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-6">{t("comingSoon")}</p>

      <Link
        href="/"
        className="inline-flex items-center justify-center min-h-[44px] px-6 rounded-xl border border-border bg-background text-foreground font-medium text-base hover:bg-muted transition-colors"
      >
        {t("backToHome")}
      </Link>
    </div>
  );
}
