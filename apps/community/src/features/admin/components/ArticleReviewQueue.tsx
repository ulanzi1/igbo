"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArticleReviewActions } from "./ArticleReviewActions";
import { ArticlePreviewModal } from "./ArticlePreviewModal";

interface AdminArticleItem {
  id: string;
  title: string;
  authorId: string;
  authorName: string | null;
  language: "en" | "ig" | "both";
  category: string;
  createdAt: string;
  slug: string;
  isFeatured: boolean;
  status: string;
}

interface ArticleListResponse {
  data: {
    items: AdminArticleItem[];
    total: number;
  };
}

export function languageLabel(lang: "en" | "ig" | "both"): string {
  if (lang === "en") return "EN";
  if (lang === "ig") return "IG";
  return "Both";
}

function ArticleTable({
  status,
  mode,
}: {
  status: "pending_review" | "published";
  mode: "pending" | "published";
}) {
  const t = useTranslations("Admin");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isPending, isError } = useQuery<ArticleListResponse>({
    queryKey: ["admin-articles", status, page],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/admin/articles?status=${status}&page=${page}&pageSize=${pageSize}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load articles");
      return res.json() as Promise<ArticleListResponse>;
    },
  });

  if (isPending) {
    return (
      <div className="text-center py-12 text-zinc-400" role="status" aria-live="polite">
        {t("articles.loading")}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12 text-red-400" role="alert">
        {t("articles.loadError")}
      </div>
    );
  }

  const items = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-400">
        {mode === "pending" ? t("articles.emptyPending") : t("articles.emptyPublished")}
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-zinc-700">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-zinc-700 bg-zinc-800/50">
              <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                {t("articles.columnTitle")}
              </th>
              <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                {t("articles.columnAuthor")}
              </th>
              <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                {t("articles.columnLanguage")}
              </th>
              <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                {t("articles.columnCategory")}
              </th>
              <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                {t("articles.columnDate")}
              </th>
              <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                {t("articles.columnActions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((article) => (
              <tr key={article.id} className="border-b border-zinc-800 hover:bg-zinc-800/30">
                <td className="px-4 py-3 text-sm text-white max-w-xs truncate">
                  <div className="flex items-center gap-2">
                    {mode === "published" && article.isFeatured && (
                      <Badge className="bg-yellow-600 text-white text-xs">
                        {t("articles.featuredBadge")}
                      </Badge>
                    )}
                    <span className="truncate">{article.title}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-zinc-300">
                  {article.authorName ?? article.authorId.slice(0, 8)}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-300">
                  {languageLabel(article.language)}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-300 capitalize">{article.category}</td>
                <td className="px-4 py-3 text-sm text-zinc-300">
                  {new Date(article.createdAt).toLocaleDateString(undefined, {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPreviewId(article.id)}
                      className="text-zinc-400 hover:text-white"
                    >
                      {t("articles.preview")}
                    </Button>
                    <ArticleReviewActions
                      articleId={article.id}
                      mode={mode}
                      isFeatured={article.isFeatured}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-zinc-400">
            {t("articles.pageInfo", { page, totalPages, total })}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="border-zinc-600 text-zinc-300 hover:bg-zinc-800"
            >
              {t("articles.previous")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="border-zinc-600 text-zinc-300 hover:bg-zinc-800"
            >
              {t("articles.next")}
            </Button>
          </div>
        </div>
      )}

      {previewId && (
        <ArticlePreviewModal articleId={previewId} onClose={() => setPreviewId(null)} />
      )}
    </>
  );
}

export function ArticleReviewQueue() {
  const t = useTranslations("Admin");

  return (
    <Tabs defaultValue="pending">
      <TabsList className="bg-zinc-800 border border-zinc-700">
        <TabsTrigger
          value="pending"
          className="data-[state=active]:bg-zinc-700 data-[state=active]:text-white text-zinc-400"
        >
          {t("articles.pendingTab")}
        </TabsTrigger>
        <TabsTrigger
          value="published"
          className="data-[state=active]:bg-zinc-700 data-[state=active]:text-white text-zinc-400"
        >
          {t("articles.publishedTab")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="pending" className="mt-4">
        <ArticleTable status="pending_review" mode="pending" />
      </TabsContent>

      <TabsContent value="published" className="mt-4">
        <ArticleTable status="published" mode="published" />
      </TabsContent>
    </Tabs>
  );
}
