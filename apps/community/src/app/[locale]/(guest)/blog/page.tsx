import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/shared/EmptyState";
import { BookOpenIcon } from "lucide-react";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "SEO" });

  return {
    title: t("blogTitle"),
    description: t("blogDescription"),
    alternates: {
      canonical: `/${locale}/blog`,
      languages: {
        en: "/en/blog",
        ig: "/ig/blog",
      },
    },
    openGraph: {
      title: t("blogTitle"),
      description: t("blogDescription"),
      type: "website",
    },
    twitter: {
      card: "summary",
      title: t("blogTitle"),
      description: t("blogDescription"),
    },
  };
}

export default async function BlogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Blog");

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:py-16">
      <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">{t("title")}</h1>
      <p className="text-base text-muted-foreground mb-8">{t("description")}</p>

      <EmptyState
        icon={<BookOpenIcon className="size-7" aria-hidden="true" />}
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
