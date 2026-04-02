"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { FeedItem } from "./FeedItem";
import type { BookmarkedPost } from "@/services/bookmark-service";
import type { FeedSortMode, FeedFilter } from "@igbo/config/feed";

interface SavedPostsListProps {
  initialPosts: BookmarkedPost[];
  initialNextCursor: string | null;
  currentUserId: string;
  currentUserRole: string;
}

export function SavedPostsList({
  initialPosts,
  initialNextCursor,
  currentUserId,
  currentUserRole,
}: SavedPostsListProps) {
  const t = useTranslations("Feed");
  const [posts, setPosts] = useState(initialPosts);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [isLoading, setIsLoading] = useState(false);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoading) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/v1/user/bookmarks?cursor=${encodeURIComponent(nextCursor)}&limit=10`,
      );
      if (res.ok) {
        const json = (await res.json()) as {
          data: { posts: BookmarkedPost[]; nextCursor: string | null };
        };
        setPosts((prev) => [...prev, ...json.data.posts]);
        setNextCursor(json.data.nextCursor);
      }
    } finally {
      setIsLoading(false);
    }
  }, [nextCursor, isLoading]);

  if (posts.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <p className="text-muted-foreground">{t("bookmarks.savedPageEmpty")}</p>
        <p className="text-sm text-muted-foreground">{t("bookmarks.savedPageEmptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <FeedItem
          key={post.id}
          post={post}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          sort={"chronological" as FeedSortMode}
          filter={"all" as FeedFilter}
        />
      ))}
      {nextCursor && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={isLoading}
          className="w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {isLoading ? t("bookmarks.loading") : t("bookmarks.loadMore")}
        </button>
      )}
    </div>
  );
}
