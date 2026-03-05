import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClockIcon, StarIcon, ArrowLeftIcon, EyeIcon, MessageCircleIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  getPublishedArticleBySlug,
  getArticleTagsById,
  getRelatedArticles,
} from "@/db/queries/articles";
import { tiptapJsonToHtml } from "@/features/articles/utils/tiptap-to-html";
import { ArticleLanguageToggle } from "@/features/articles/components/ArticleLanguageToggle";
import { ArticleViewTracker } from "@/features/articles/components/ArticleViewTracker";
import { ArticleComments } from "@/features/articles/components/ArticleComments";
import { ArticleRelatedSuggestions } from "@/features/articles/components/ArticleRelatedSuggestions";

export const revalidate = 60;

const categoryColors: Record<string, string> = {
  discussion: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  announcement: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  event: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; articleId: string }>;
}) {
  const { locale, articleId: slug } = await params;
  const article = await getPublishedArticleBySlug(slug);

  if (!article) return {};

  return {
    title: `${article.title} — OBIGBO`,
    description: article.titleIgbo ?? article.title,
    alternates: {
      canonical: `/${locale}/articles/${slug}`,
      languages:
        article.language === "both"
          ? { en: `/en/articles/${slug}`, ig: `/ig/articles/${slug}` }
          : { en: `/en/articles/${slug}` },
    },
    openGraph: {
      title: article.title,
      description: article.titleIgbo ?? article.title,
      type: "article",
      publishedTime: article.createdAt.toISOString(),
      ...(article.coverImageUrl ? { images: [article.coverImageUrl] } : {}),
    },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ locale: string; articleId: string }>;
}) {
  const { locale, articleId: slug } = await params;
  setRequestLocale(locale);

  const article = await getPublishedArticleBySlug(slug);
  if (!article) notFound();

  const t = await getTranslations("Articles");
  const isBilingual = article.language === "both";

  const enContent = tiptapJsonToHtml(article.content);
  const igContent = article.contentIgbo ? tiptapJsonToHtml(article.contentIgbo) : null;

  // Fetch related articles for the sidebar
  const relatedTags = await getArticleTagsById(article.id);
  const related = await getRelatedArticles(article.id, article.authorId, relatedTags, 3);

  // JSON-LD structured data
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    datePublished: article.createdAt.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    author: {
      "@type": "Person",
      name: article.authorName ?? "OBIGBO Member",
    },
    publisher: {
      "@type": "Organization",
      name: "OBIGBO",
    },
    ...(article.coverImageUrl ? { image: article.coverImageUrl } : {}),
    url: `https://obigbo.com/${locale}/articles/${slug}`,
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:py-14">
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* View tracker — fires POST on mount (fire-and-forget) */}
      <ArticleViewTracker articleId={article.id} />

      {/* Back link */}
      <Link
        href="/articles"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
      >
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
        {t("title")}
      </Link>

      {/* Cover image */}
      {article.coverImageUrl && (
        <div className="rounded-xl overflow-hidden mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.coverImageUrl}
            alt={article.title}
            className="w-full max-h-80 object-cover"
          />
        </div>
      )}

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryColors[article.category] ?? ""}`}
        >
          {t(`reading.category.${article.category}`)}
        </span>
        {article.isFeatured && (
          <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            <StarIcon className="size-3" aria-hidden="true" />
            {t("reading.featuredBadge")}
          </span>
        )}
        {isBilingual && (
          <span className="text-xs text-muted-foreground border border-border rounded-full px-2 py-0.5">
            {t("reading.bilingualBadge")}
          </span>
        )}
        <span className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
          <ClockIcon className="size-3" aria-hidden="true" />
          {t("reading.readMin", { n: article.readingTimeMinutes })}
        </span>
      </div>

      {/* Title */}
      <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-2">{article.title}</h1>
      {article.titleIgbo && (
        <p className="text-lg text-muted-foreground mb-4">{article.titleIgbo}</p>
      )}

      {/* Byline */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground mb-8 pb-6 border-b border-border">
        {article.authorName && <span>{article.authorName}</span>}
        <span>
          {new Date(article.createdAt).toLocaleDateString(locale, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </span>
        <span className="flex items-center gap-1">
          <EyeIcon className="size-3" aria-hidden="true" />
          {t("reading.viewCount", { count: article.viewCount })}
        </span>
        <span className="flex items-center gap-1">
          <MessageCircleIcon className="size-3" aria-hidden="true" />
          {t("reading.commentCount", { count: article.commentCount })}
        </span>
      </div>

      {/* Article content — language toggle for bilingual, direct render otherwise */}
      <ArticleLanguageToggle
        enContent={enContent}
        igContent={igContent}
        isBilingual={isBilingual}
      />

      {/* Related articles */}
      <ArticleRelatedSuggestions articles={related} />

      {/* Comments section */}
      <ArticleComments articleId={article.id} membersOnly={article.visibility === "members_only"} />
    </div>
  );
}
