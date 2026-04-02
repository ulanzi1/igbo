import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "SEO" });

  return {
    title: t("termsTitle"),
    description: t("termsDescription"),
    alternates: {
      canonical: `/${locale}/terms`,
      languages: {
        en: "/en/terms",
        ig: "/ig/terms",
      },
    },
  };
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Terms");

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <h1 className="text-3xl md:text-4xl font-bold text-primary mb-8">{t("heading")}</h1>
      <p className="text-base text-muted-foreground leading-relaxed mb-4">{t("content")}</p>
      <p className="text-sm text-muted-foreground">{t("lastUpdated")}</p>
    </article>
  );
}
