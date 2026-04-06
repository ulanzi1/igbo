import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDocumentBySlug } from "@/services/governance-document-service";
import { sanitizeHtml } from "@/lib/sanitize";

export const revalidate = 60;

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
  const tGov = await getTranslations("Governance");

  const doc = await getDocumentBySlug("about-us");

  if (!doc || doc.status !== "published") {
    return (
      <article className="mx-auto max-w-3xl px-4 py-12 md:py-16">
        <p className="text-muted-foreground">{tGov("contentUnavailable")}</p>
      </article>
    );
  }

  const rawContent = locale === "ig" && doc.contentIgbo ? doc.contentIgbo : doc.content;

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <h1 className="text-3xl md:text-4xl font-bold text-primary mb-8">{doc.title}</h1>

      <div
        className="prose prose-lg max-w-none text-muted-foreground"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(rawContent) }}
      />

      <section className="rounded-xl bg-muted p-8 text-center mt-12">
        <Link
          href="/apply"
          className="inline-flex items-center justify-center min-h-[44px] px-8 rounded-xl bg-primary text-primary-foreground font-medium text-base hover:opacity-90 transition-opacity"
        >
          {tGov("applyButton")}
        </Link>
      </section>
    </article>
  );
}
