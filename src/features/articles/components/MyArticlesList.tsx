"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { AuthorArticleListItem } from "@/db/queries/articles";

interface MyArticlesListProps {
  articles: AuthorArticleListItem[];
}

const STATUS_ORDER: AuthorArticleListItem["status"][] = [
  "published",
  "pending_review",
  "revision_requested",
  "rejected",
  "draft",
];

const STATUS_BADGE_CLASS: Record<AuthorArticleListItem["status"], string> = {
  published: "bg-green-800 text-green-200",
  pending_review: "bg-blue-800 text-blue-200",
  revision_requested: "bg-amber-800 text-amber-200",
  rejected: "bg-red-800 text-red-200",
  draft: "bg-zinc-700 text-zinc-300",
};

export function MyArticlesList({ articles }: MyArticlesListProps) {
  const t = useTranslations("Articles");

  if (articles.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground mb-4">{t("myArticles.empty")}</p>
        <Link
          href="/articles/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t("myArticles.emptyButton")}
        </Link>
      </div>
    );
  }

  const sectionLabels: Record<AuthorArticleListItem["status"], string> = {
    published: t("myArticles.sectionPublished"),
    pending_review: t("myArticles.sectionPending"),
    revision_requested: t("myArticles.sectionRevision"),
    rejected: t("myArticles.sectionRejected"),
    draft: t("myArticles.sectionDraft"),
  };

  const grouped = STATUS_ORDER.reduce<Record<string, AuthorArticleListItem[]>>((acc, status) => {
    const items = articles.filter((a) => a.status === status);
    if (items.length > 0) acc[status] = items;
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      {STATUS_ORDER.filter((s) => grouped[s]).map((status) => (
        <section key={status}>
          <h2 className="text-lg font-semibold mb-3">{sectionLabels[status]}</h2>
          <div className="space-y-2">
            {grouped[status].map((article) => (
              <div
                key={article.id}
                className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3 bg-card"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{article.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[article.status]}`}
                    >
                      {sectionLabels[article.status]}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize">
                      {article.category}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(article.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div>
                  {article.status === "published" ? (
                    <Link
                      href={`/articles/${article.slug}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {t("myArticles.viewButton")}
                    </Link>
                  ) : (
                    <Link
                      href={`/articles/${article.id}/edit`}
                      className="text-sm text-primary hover:underline"
                    >
                      {t("myArticles.editButton")}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
