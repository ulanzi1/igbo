"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CommentItem } from "./CommentItem";
import { addCommentAction } from "../actions/add-comment";
import type { PostComment } from "@igbo/db/queries/post-interactions";

interface CommentSectionProps {
  postId: string;
  initialCount: number; // from post.commentCount
  currentUserId: string;
  onCommentCountChange?: (count: number) => void;
}

export function CommentSection({
  postId,
  initialCount,
  currentUserId,
  onCommentCountChange,
}: CommentSectionProps) {
  const t = useTranslations("Feed");
  const [inputValue, setInputValue] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [localCount, setLocalCount] = useState(initialCount);

  // Manual cursor-based pagination with accumulated comments
  const [comments, setComments] = useState<PostComment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchComments = useCallback(
    async (cursor?: string) => {
      const isMore = !!cursor;
      if (isMore) setIsLoadingMore(true);
      else setIsLoading(true);
      try {
        const url = cursor
          ? `/api/v1/posts/${postId}/comments?limit=10&cursor=${encodeURIComponent(cursor)}`
          : `/api/v1/posts/${postId}/comments?limit=10`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch comments");
        const json = (await res.json()) as {
          data: { comments: PostComment[]; nextCursor: string | null };
        };
        setComments((prev) => (isMore ? [...prev, ...json.data.comments] : json.data.comments));
        setNextCursor(json.data.nextCursor);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [postId],
  );

  // Fetch initial page on mount — MUST use useEffect (not conditional in render body).
  // Setting state during render causes infinite loops in React 18+ strict mode.
  useEffect(() => {
    if (!hasFetched) {
      setHasFetched(true);
      void fetchComments();
    }
  }, [hasFetched, fetchComments]);

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const res = await fetch(`/api/v1/posts/${postId}/comments/${commentId}`, {
        method: "DELETE",
        headers: { Origin: window.location.origin },
      });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      // Reset and refetch from scratch
      setHasFetched(false);
      setComments([]);
      setNextCursor(null);
    },
  });

  const handleReply = (parentId: string, parentName: string) => {
    setReplyTo({ id: parentId, name: parentName });
    setInputValue("");
  };

  const handleSubmit = () => {
    const content = inputValue.trim();
    if (!content) return;
    setSubmitError(null);

    startTransition(async () => {
      const result = await addCommentAction({
        postId,
        content,
        parentCommentId: replyTo?.id ?? null,
      });

      if (!result.success) {
        if (result.errorCode === "PARENT_NOT_FOUND") {
          setSubmitError(t("comments.errorParentNotFound"));
        } else {
          setSubmitError(t("comments.errorGeneric"));
        }
        return;
      }

      setInputValue("");
      setReplyTo(null);
      setLocalCount((c) => c + 1);
      onCommentCountChange?.(localCount + 1);
      // Reset and refetch from scratch to include the new comment
      setHasFetched(false);
      setComments([]);
      setNextCursor(null);
    });
  };

  return (
    <div className="space-y-3 pt-2 border-t border-border">
      {/* Comment input */}
      <div className="space-y-2">
        {replyTo && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t("comments.replyTo", { name: replyTo.name })}</span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="text-xs hover:text-foreground"
            >
              ×
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={t("comments.addComment")}
            rows={2}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={isPending || !inputValue.trim()}
            onClick={handleSubmit}
            className="self-end"
          >
            {isPending ? t("comments.submitting") : t("comments.submit")}
          </Button>
        </div>
        {submitError && (
          <p className="text-xs text-destructive" role="alert">
            {submitError}
          </p>
        )}
      </div>

      {/* Comments list */}
      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t("loading")}</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">{t("comments.noComments")}</p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={currentUserId}
              onReply={handleReply}
              onDelete={async (id) => {
                await deleteCommentMutation.mutateAsync(id);
              }}
            />
          ))}
          {nextCursor && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => void fetchComments(nextCursor)}
              disabled={isLoadingMore}
            >
              {t("comments.loadMore")}
            </Button>
          )}
        </div>
      )}
      {/* localCount is synced to parent via onCommentCountChange */}
      <span className="sr-only" aria-hidden="true" data-count={localCount} />
    </div>
  );
}
