"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import sanitizeHtml from "sanitize-html";
import { generateHTML } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TiptapImage from "@tiptap/extension-image";
import TiptapLink from "@tiptap/extension-link";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { languageLabel } from "./ArticleReviewQueue";

const PREVIEW_EXTENSIONS = [StarterKit, TiptapImage, TiptapLink];

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ["href", "name", "target", "rel"],
  },
};

function tiptapToHtml(content: string): string {
  try {
    const json = JSON.parse(content) as object;
    return generateHTML(json, PREVIEW_EXTENSIONS);
  } catch {
    return content;
  }
}

interface ArticlePreviewModalProps {
  articleId: string;
  onClose: () => void;
}

interface ArticleData {
  id: string;
  title: string;
  titleIgbo?: string | null;
  slug: string;
  content: string;
  contentIgbo?: string | null;
  coverImageUrl?: string | null;
  language: "en" | "ig" | "both";
  visibility: "guest" | "members_only";
  status: "draft" | "pending_review" | "published" | "rejected";
  category: string;
  isFeatured: boolean;
  readingTimeMinutes: number;
  rejectionFeedback?: string | null;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export function ArticlePreviewModal({ articleId, onClose }: ArticlePreviewModalProps) {
  const t = useTranslations("Admin");

  const { data, isPending, isError } = useQuery<{ data: ArticleData }>({
    queryKey: ["admin-article-preview", articleId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/admin/articles/${articleId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load article");
      return res.json() as Promise<{ data: ArticleData }>;
    },
  });

  const article = data?.data;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-zinc-900 text-white border-zinc-700">
        <DialogHeader>
          <DialogTitle className="text-white">{t("articles.preview")}</DialogTitle>
        </DialogHeader>

        {isPending && <div className="py-8 text-center text-zinc-400">{t("articles.loading")}</div>}

        {isError && (
          <div className="py-8 text-center text-red-400">{t("articles.loadArticleError")}</div>
        )}

        {article && (
          <div className="space-y-4">
            {/* Cover image */}
            {article.coverImageUrl && (
              <div className="rounded-lg overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={article.coverImageUrl}
                  alt={article.title}
                  className="w-full max-h-64 object-cover"
                />
              </div>
            )}

            {/* Badges row */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-zinc-300 border-zinc-600">
                {languageLabel(article.language)}
              </Badge>
              <Badge variant="outline" className="text-zinc-300 border-zinc-600 capitalize">
                {article.category}
              </Badge>
              <Badge
                variant="outline"
                className={
                  article.visibility === "guest"
                    ? "text-green-400 border-green-700"
                    : "text-blue-400 border-blue-700"
                }
              >
                {t(`articles.visibility${article.visibility === "guest" ? "Guest" : "Members"}`)}
              </Badge>
              <Badge
                variant="outline"
                className={
                  article.status === "published"
                    ? "text-emerald-400 border-emerald-700"
                    : article.status === "rejected"
                      ? "text-red-400 border-red-700"
                      : "text-amber-400 border-amber-700"
                }
              >
                {article.status.replace("_", " ")}
              </Badge>
              {article.isFeatured && (
                <Badge className="bg-amber-600 text-white border-0">
                  {t("articles.featuredBadge")}
                </Badge>
              )}
              <span className="text-xs text-zinc-400 ml-auto">
                {t("articles.readingTime", { minutes: article.readingTimeMinutes })}
              </span>
            </div>

            {/* Title */}
            <div>
              <h2 className="text-xl font-bold">{article.title}</h2>
              {article.titleIgbo && <p className="text-zinc-400 mt-1">{article.titleIgbo}</p>}
            </div>

            {/* Slug */}
            <div className="text-xs text-zinc-500 font-mono">
              <span className="text-zinc-400">{t("articles.slug")}: </span>
              {article.slug}
            </div>

            {/* English content */}
            <div className="prose prose-invert max-w-none">
              <div
                className="text-zinc-200 text-sm"
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(tiptapToHtml(article.content), SANITIZE_OPTIONS),
                }}
              />
            </div>

            {/* Igbo content */}
            {article.contentIgbo && (
              <div className="border-t border-zinc-700 pt-4">
                <p className="text-xs text-zinc-400 mb-2 uppercase tracking-wider">
                  {t("articles.igboLabel")}
                </p>
                <div
                  className="text-zinc-200 text-sm"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(tiptapToHtml(article.contentIgbo), SANITIZE_OPTIONS),
                  }}
                />
              </div>
            )}

            {/* Rejection feedback */}
            {article.rejectionFeedback && (
              <div className="border-t border-red-900 pt-4">
                <p className="text-xs text-red-400 mb-2 uppercase tracking-wider">
                  {t("articles.rejectionFeedbackLabel")}
                </p>
                <p className="text-zinc-300 text-sm">{article.rejectionFeedback}</p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                onClick={onClose}
                className="border-zinc-600 text-zinc-300 hover:bg-zinc-800"
              >
                {t("articles.close")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
