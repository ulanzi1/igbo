import { getTranslations, setRequestLocale } from "next-intl/server";
import { FileTextIcon, ClockIcon, StarIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { listPublishedArticlesPublic } from "@/db/queries/articles";
import type { PublicArticleListItem } from "@/db/queries/articles";

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

function ArticleCard({ article }: { article: PublicArticleListItem }) {
  const categoryColors: Record<string, string> = {
    discussion: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    announcement: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    event: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  };

  return (
    <a
      href={`/articles/${article.slug}`}
      className="group block rounded-xl border border-border bg-card hover:bg-accent/40 transition-colors overflow-hidden"
    >
      {article.coverImageUrl && (
        <div className="aspect-[16/7] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.coverImageUrl}
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      )}

      <div className="p-5">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${categoryColors[article.category] ?? ""}`}
          >
            {article.category}
          </span>
          {article.isFeatured && (
            <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
              <StarIcon className="size-3" aria-hidden="true" />
              Featured
            </span>
          )}
          {article.language === "both" && (
            <span className="text-xs text-muted-foreground">EN + IG</span>
          )}
        </div>

        <h2 className="font-semibold text-lg leading-snug group-hover:text-primary transition-colors mb-1">
          {article.title}
        </h2>
        {article.titleIgbo && (
          <p className="text-sm text-muted-foreground mb-2">{article.titleIgbo}</p>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-3">
          {article.authorName && <span>{article.authorName}</span>}
          <span className="flex items-center gap-1">
            <ClockIcon className="size-3" aria-hidden="true" />
            {article.readingTimeMinutes} min
          </span>
          <span>{new Date(article.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    </a>
  );
}

export default async function ArticlesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Articles");

  const { items: articles } = await listPublishedArticlesPublic({ pageSize: 50 });

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:py-16">
      <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">{t("title")}</h1>
      <p className="text-base text-muted-foreground mb-8">{t("description")}</p>

      {articles.length === 0 ? (
        <EmptyState
          icon={<FileTextIcon className="size-7" aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          primaryAction={{
            label: t("ctaButton"),
            href: "/apply",
          }}
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}
