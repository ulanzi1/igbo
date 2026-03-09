"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ReportDialog } from "@/components/shared/ReportDialog";
import type { ArticleCommentItem } from "@/db/queries/article-comments";

interface ArticleCommentsProps {
  articleId: string;
  membersOnly?: boolean;
}

interface CommentsResponse {
  data: {
    items: ArticleCommentItem[];
    total: number;
  };
}

export function ArticleComments({ articleId, membersOnly = false }: ArticleCommentsProps) {
  const t = useTranslations("Articles");
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState("");
  const isGuest = status === "unauthenticated";

  const { data, isLoading } = useQuery({
    queryKey: ["article-comments", articleId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/articles/${articleId}/comments`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json() as Promise<CommentsResponse>;
    },
  });

  const mutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/v1/articles/${articleId}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to post comment");
      return res.json();
    },
    onSuccess: () => {
      setCommentText("");
      void queryClient.invalidateQueries({ queryKey: ["article-comments", articleId] });
    },
  });

  const comments = data?.data?.items ?? [];

  return (
    <section className="mt-12 pt-8 border-t border-border">
      <h2 className="text-xl font-semibold mb-6">{t("comments.title")}</h2>

      {/* Comment list */}
      {isLoading ? null : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-6">{t("comments.empty")}</p>
      ) : (
        <ul className="space-y-4 mb-6">
          {comments.map((comment) => (
            <ArticleCommentRow
              key={comment.id}
              comment={comment}
              currentUserId={session?.user?.id}
            />
          ))}
        </ul>
      )}

      {/* Guest — members-only notice */}
      {isGuest && membersOnly && (
        <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          <p>
            {t("comments.membersOnlyCta")}{" "}
            <Link href="/apply" className="text-primary underline">
              {t("comments.guestButton")}
            </Link>
          </p>
        </div>
      )}

      {/* Guest — general CTA */}
      {isGuest && !membersOnly && (
        <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          <p>
            {t("comments.guestCta")}{" "}
            <Link href="/apply" className="text-primary underline">
              {t("comments.guestButton")}
            </Link>
          </p>
        </div>
      )}

      {/* Authenticated — comment form */}
      {!isGuest && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (commentText.trim()) {
              mutation.mutate(commentText);
            }
          }}
          className="flex flex-col gap-3"
        >
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder={t("comments.placeholder")}
            maxLength={2000}
            rows={3}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {mutation.isError && <p className="text-sm text-destructive">{t("comments.error")}</p>}
          <button
            type="submit"
            disabled={mutation.isPending || !commentText.trim()}
            className="self-end rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {mutation.isPending ? t("comments.submitting") : t("comments.submit")}
          </button>
        </form>
      )}
    </section>
  );
}

function ArticleCommentRow({
  comment,
  currentUserId,
}: {
  comment: ArticleCommentItem;
  currentUserId?: string;
}) {
  const tReports = useTranslations("Reports");
  const [showReport, setShowReport] = useState(false);
  const isOwn = currentUserId === comment.authorId;

  return (
    <li className="flex flex-col gap-1 rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{comment.authorName ?? "Member"}</span>
        <span>·</span>
        <time
          dateTime={
            comment.createdAt instanceof Date
              ? comment.createdAt.toISOString()
              : String(comment.createdAt)
          }
        >
          {new Date(comment.createdAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </time>
        {!isOwn && currentUserId && (
          <button
            type="button"
            onClick={() => setShowReport(true)}
            className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            {tReports("action.report")}
          </button>
        )}
      </div>
      <p className="text-sm">{comment.content}</p>
      {showReport && (
        <ReportDialog
          contentType="comment"
          contentId={comment.id}
          onClose={() => setShowReport(false)}
        />
      )}
    </li>
  );
}
