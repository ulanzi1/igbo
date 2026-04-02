import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { RelatedArticle } from "@/db/queries/articles";

interface ArticleRelatedSuggestionsProps {
  articles: RelatedArticle[];
}

export async function ArticleRelatedSuggestions({ articles }: ArticleRelatedSuggestionsProps) {
  if (articles.length === 0) return null;

  const t = await getTranslations("Articles");

  return (
    <section className="mt-12 pt-8 border-t border-border">
      <h2 className="text-xl font-semibold mb-6">{t("related.title")}</h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <li key={article.id}>
            <Link
              href={`/articles/${article.slug}`}
              className="group flex flex-col gap-2 rounded-lg border border-border overflow-hidden hover:border-primary transition-colors"
            >
              {article.coverImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={article.coverImageUrl}
                  alt={article.title}
                  className="w-full h-32 object-cover"
                />
              )}
              <div className="p-3 flex flex-col gap-1">
                <p className="text-sm font-medium leading-snug group-hover:text-primary transition-colors line-clamp-2">
                  {article.title}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {article.authorName && (
                    <>
                      <span>{article.authorName}</span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <span>{t("related.readMin", { n: article.readingTimeMinutes })}</span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
