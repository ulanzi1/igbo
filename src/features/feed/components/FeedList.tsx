"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useFeed } from "../hooks/use-feed";
import { FeedItem } from "./FeedItem";
import { FeedItemSkeleton } from "./FeedItemSkeleton";
import { PostComposer } from "./PostComposer";
import { Button } from "@/components/ui/button";
import type { FeedSortMode, FeedFilter } from "@/config/feed";

interface FeedListProps {
  initialSort?: FeedSortMode;
  initialFilter?: FeedFilter;
  canCreatePost?: boolean;
  userName?: string;
  userPhotoUrl?: string | null;
  currentUserId?: string;
}

export function FeedList({
  initialSort = "chronological",
  initialFilter = "all",
  canCreatePost = false,
  userName = "",
  userPhotoUrl = null,
  currentUserId = "",
}: FeedListProps) {
  const t = useTranslations("Feed");

  // Sort preference persisted in sessionStorage — restore after hydration to avoid mismatch
  const [sort, setSort] = useState<FeedSortMode>(initialSort);
  const [filter, setFilter] = useState<FeedFilter>(initialFilter);

  useEffect(() => {
    const stored = sessionStorage.getItem("feed-sort") as FeedSortMode | null;
    if (stored && stored !== sort) {
      setSort(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSortChange = (newSort: FeedSortMode) => {
    setSort(newSort);
    sessionStorage.setItem("feed-sort", newSort);
  };

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } = useFeed({
    sort,
    filter,
  });

  // Infinite scroll via IntersectionObserver
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fetchNextPageStable = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) fetchNextPageStable();
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPageStable]);

  const allPosts = data?.pages.flatMap((p) => p.posts) ?? [];
  const isColdStart = data?.pages[0]?.isColdStart ?? false;

  // Initial loading
  if (isLoading) {
    return (
      <div className="space-y-4">
        <PostComposer
          userName={userName}
          canCreatePost={canCreatePost}
          photoUrl={userPhotoUrl}
          sort={sort}
          filter={filter}
        />
        <FeedControls
          sort={sort}
          filter={filter}
          onSortChange={handleSortChange}
          onFilterChange={setFilter}
        />
        {Array.from({ length: 3 }).map((_, i) => (
          <FeedItemSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">{t("loadError")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PostComposer
        userName={userName}
        canCreatePost={canCreatePost}
        photoUrl={userPhotoUrl}
        sort={sort}
        filter={filter}
      />
      <FeedControls
        sort={sort}
        filter={filter}
        onSortChange={handleSortChange}
        onFilterChange={setFilter}
      />

      {/* Announcements-only badge */}
      {filter === "announcements" && (
        <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
          <span className="font-medium">{t("announcementsOnlyBadge")}</span>
          <Button variant="ghost" size="sm" onClick={() => setFilter("all")}>
            {t("showAllPosts")}
          </Button>
        </div>
      )}

      {/* Cold-start empty state */}
      {isColdStart && allPosts.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center space-y-3">
          <h2 className="text-lg font-semibold">{t("coldStartHeading")}</h2>
          <p className="text-sm text-muted-foreground">{t("coldStartPrompt")}</p>
          <Link href="/discover">
            <Button variant="outline" size="sm">
              {t("coldStartCta")}
            </Button>
          </Link>
        </div>
      )}

      {/* Cold-start prompt when cold-start but some platform posts are shown */}
      {isColdStart && allPosts.length > 0 && (
        <div className="rounded-lg border border-muted bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {t("coldStartPrompt")} —{" "}
          <Link href="/discover" className="underline hover:text-foreground">
            {t("coldStartCta")}
          </Link>
        </div>
      )}

      {/* Feed items */}
      {allPosts.length > 0 ? (
        <>
          <ul className="space-y-4" aria-label={t("feedPostsList")}>
            {allPosts.map((post) => (
              <li key={post.id}>
                <FeedItem post={post} currentUserId={currentUserId} sort={sort} filter={filter} />
              </li>
            ))}
          </ul>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} aria-hidden="true" className="h-4" />

          {/* Manual load-more fallback (e.g., if IntersectionObserver not supported) */}
          {hasNextPage && !isFetchingNextPage && (
            <Button variant="outline" className="w-full" onClick={() => void fetchNextPage()}>
              {t("loadMore")}
            </Button>
          )}

          {isFetchingNextPage && (
            <div className="space-y-4">
              <FeedItemSkeleton />
            </div>
          )}
        </>
      ) : (
        !isColdStart && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {filter === "announcements" ? t("noPostsInMode") : t("noPostsYet")}
          </p>
        )
      )}
    </div>
  );
}

interface FeedControlsProps {
  sort: FeedSortMode;
  filter: FeedFilter;
  onSortChange: (s: FeedSortMode) => void;
  onFilterChange: (f: FeedFilter) => void;
}

function FeedControls({ sort, filter, onSortChange, onFilterChange }: FeedControlsProps) {
  const t = useTranslations("Feed");
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      {/* Sort toggle */}
      <div
        className="flex rounded-md border border-border overflow-hidden"
        role="group"
        aria-label={t("feedSortGroup")}
      >
        {(["chronological", "algorithmic"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onSortChange(mode)}
            aria-pressed={sort === mode}
            className={`px-3 py-1.5 text-sm font-medium transition-colors min-h-[44px] ${
              sort === mode
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            {mode === "chronological" ? t("sortChronological") : t("sortAlgorithmic")}
          </button>
        ))}
      </div>

      {/* Announcements filter */}
      <button
        type="button"
        onClick={() => onFilterChange(filter === "announcements" ? "all" : "announcements")}
        aria-pressed={filter === "announcements"}
        className="px-3 py-1.5 text-sm font-medium rounded-md border border-border transition-colors min-h-[44px]"
      >
        {t("filterAnnouncements")}
      </button>
    </div>
  );
}
