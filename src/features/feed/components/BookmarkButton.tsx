"use client";

import { useState, useTransition } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { toggleBookmarkAction } from "../actions/toggle-bookmark";

interface BookmarkButtonProps {
  postId: string;
  initialIsBookmarked: boolean;
}

export function BookmarkButton({ postId, initialIsBookmarked }: BookmarkButtonProps) {
  const t = useTranslations("Feed");
  const [isBookmarked, setIsBookmarked] = useState(initialIsBookmarked);
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    startTransition(async () => {
      const prevState = isBookmarked;
      // Optimistic update
      setIsBookmarked((prev) => !prev);

      const result = await toggleBookmarkAction({ postId });
      if ("errorCode" in result) {
        // Rollback on error
        setIsBookmarked(prevState);
      } else {
        // Sync with server response
        setIsBookmarked(result.bookmarked);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      aria-label={
        isBookmarked ? t("bookmarks.bookmarkedAriaLabel") : t("bookmarks.bookmarkAriaLabel")
      }
      aria-pressed={isBookmarked}
      className={`flex items-center justify-center rounded-full p-2 min-h-[36px] min-w-[36px] transition-colors ${
        isBookmarked ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-accent"
      }`}
    >
      {/* Lucide icons: filled when saved, outline when not */}
      {isBookmarked ? (
        <BookmarkCheck className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Bookmark className="h-5 w-5" aria-hidden="true" />
      )}
      <span className="sr-only">
        {isBookmarked ? t("bookmarks.unbookmark") : t("bookmarks.bookmark")}
      </span>
    </button>
  );
}
