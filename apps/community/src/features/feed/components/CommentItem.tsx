"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ReportDialog } from "@/components/shared/ReportDialog";
import type { PostComment } from "@/db/queries/post-interactions";

interface CommentItemProps {
  comment: PostComment;
  currentUserId: string;
  onReply: (parentCommentId: string, parentAuthorName: string) => void;
  onDelete: (commentId: string) => Promise<void>;
  isReply?: boolean;
}

export function CommentItem({
  comment,
  currentUserId,
  onReply,
  onDelete,
  isReply = false,
}: CommentItemProps) {
  const t = useTranslations("Feed");
  const tReports = useTranslations("Reports");
  const [isDeleting, startDeleteTransition] = useTransition();
  const [showReport, setShowReport] = useState(false);

  const initials = comment.authorDisplayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const isDeleted = comment.deletedAt !== null;
  const isOwn = comment.authorId === currentUserId;

  const handleDelete = () => {
    startDeleteTransition(async () => {
      await onDelete(comment.id);
    });
  };

  return (
    <div className={`flex gap-2 ${isReply ? "ml-10" : ""}`}>
      <Avatar className="h-8 w-8 shrink-0 mt-0.5">
        <AvatarImage src={comment.authorPhotoUrl ?? undefined} alt={comment.authorDisplayName} />
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="rounded-lg bg-muted px-3 py-2 text-sm">
          {isDeleted ? (
            <p className="text-muted-foreground italic">{t("comments.deleted")}</p>
          ) : (
            <>
              <span className="font-medium text-sm">{comment.authorDisplayName}</span>
              <p className="mt-0.5 text-sm whitespace-pre-wrap break-words">{comment.content}</p>
            </>
          )}
        </div>
        {/* Actions: Reply + Delete (own comments only) */}
        {!isDeleted && (
          <div className="flex gap-3 mt-1 px-1">
            {!isReply && (
              <button
                type="button"
                onClick={() => onReply(comment.id, comment.authorDisplayName)}
                className="text-xs text-muted-foreground hover:text-foreground font-medium"
              >
                {t("comments.reply")}
              </button>
            )}
            {isOwn && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-xs text-muted-foreground hover:text-destructive font-medium"
              >
                {t("comments.delete")}
              </button>
            )}
            {!isOwn && (
              <button
                type="button"
                onClick={() => setShowReport(true)}
                className="text-xs text-muted-foreground hover:text-destructive font-medium"
              >
                {tReports("action.report")}
              </button>
            )}
          </div>
        )}
        {showReport && (
          <ReportDialog
            contentType="comment"
            contentId={comment.id}
            onClose={() => setShowReport(false)}
          />
        )}
        {/* Nested replies */}
        {!isReply && comment.replies.length > 0 && (
          <div className="mt-2 space-y-2">
            {comment.replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                currentUserId={currentUserId}
                onReply={onReply}
                onDelete={onDelete}
                isReply
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
