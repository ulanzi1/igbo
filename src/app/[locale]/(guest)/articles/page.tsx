import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/shared/EmptyState";
import { FileTextIcon } from "lucide-react";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "SEO" });

  return {
    title: t("articlesTitle"),
    description: t("articlesDescription"),
    alternates: {
      canonical: `/${locale}/articles`,
      languages: {
        en: "/en/articles",
        ig: "/ig/articles",
      },
    },
    openGraph: {
      title: t("articlesTitle"),
      description: t("articlesDescription"),
      type: "website",
    },
    twitter: {
      card: "summary",
      title: t("articlesTitle"),
      description: t("articlesDescription"),
    },
  };
}

export default async function ArticlesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Articles");

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:py-16">
      <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">{t("title")}</h1>
      <p className="text-base text-muted-foreground mb-8">{t("description")}</p>

      <EmptyState
        icon={<FileTextIcon className="size-7" aria-hidden="true" />}
        title={t("emptyTitle")}
        description={t("emptyDescription")}
        primaryAction={{
          label: t("ctaButton"),
          href: "/apply",
        }}
      />
    </div>
  );
}
