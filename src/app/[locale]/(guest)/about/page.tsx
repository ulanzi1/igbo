import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "SEO" });

  return {
    title: t("aboutTitle"),
    description: t("aboutDescription"),
    alternates: {
      canonical: `/${locale}/about`,
      languages: {
        en: "/en/about",
        ig: "/ig/about",
      },
    },
    openGraph: {
      title: t("aboutTitle"),
      description: t("aboutDescription"),
      type: "website",
    },
    twitter: {
      card: "summary",
      title: t("aboutTitle"),
      description: t("aboutDescription"),
    },
  };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("About");

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <h1 className="text-3xl md:text-4xl font-bold text-primary mb-8">{t("title")}</h1>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">{t("mission")}</h2>
        <p className="text-base text-muted-foreground leading-relaxed">{t("missionText")}</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">{t("vision")}</h2>
        <p className="text-base text-muted-foreground leading-relaxed">{t("visionText")}</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">{t("culture")}</h2>
        <p className="text-base text-muted-foreground leading-relaxed">{t("cultureText")}</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">{t("founding")}</h2>
        <p className="text-base text-muted-foreground leading-relaxed">{t("foundingText")}</p>
      </section>

      <section className="rounded-xl bg-muted p-8 text-center">
        <h2 className="text-xl font-semibold mb-3">{t("ctaHeading")}</h2>
        <p className="text-base text-muted-foreground mb-6">{t("ctaText")}</p>
        <Link
          href="/apply"
          className="inline-flex items-center justify-center min-h-[44px] px-8 rounded-xl bg-primary text-primary-foreground font-medium text-base hover:opacity-90 transition-opacity"
        >
          {t("ctaButton")}
        </Link>
      </section>
    </article>
  );
}
