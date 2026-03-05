"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PostComposer } from "@/features/feed/components/PostComposer";
import { FeedItem } from "@/features/feed/components/FeedItem";
import type { FeedPost } from "@/features/feed/types";

interface GroupFeedTabProps {
  groupId: string;
  viewerId: string;
  viewerRole: "member" | "leader" | "creator" | null;
  viewerDisplayName: string;
  viewerPhotoUrl?: string | null;
  canPost: boolean;
  isModerated: boolean;
}

interface FeedPageData {
  posts: FeedPost[];
  nextCursor: string | null;
}

interface PendingPost {
  id: string;
  authorId: string;
  authorDisplayName: string;
  authorPhotoUrl: string | null;
  content: string;
  contentType: string;
  createdAt: string;
  media: Array<{ id: string; mediaUrl: string; mediaType: string; sortOrder: number }>;
}

interface PendingPageData {
  posts: PendingPost[];
  nextCursor: string | null;
}

export function GroupFeedTab({
  groupId,
  viewerId,
  viewerRole,
  viewerDisplayName,
  viewerPhotoUrl,
  canPost,
  isModerated,
}: GroupFeedTabProps) {
  const t = useTranslations("Groups");
  const queryClient = useQueryClient();
  const isLeaderOrCreator = viewerRole === "leader" || viewerRole === "creator";
  const [showPending, setShowPending] = useState(false);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery<FeedPageData>({
    queryKey: ["group-feed", groupId],
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as string | undefined;
      const url = new URL(`/api/v1/groups/${groupId}/posts`, window.location.origin);
      if (cursor) url.searchParams.set("cursor", cursor);
      url.searchParams.set("limit", "20");
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch group feed");
      const json = (await res.json()) as { data: { posts: FeedPost[]; nextCursor: string | null } };
      return json.data;
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const {
    data: pendingData,
    fetchNextPage: fetchNextPending,
    hasNextPage: hasPendingNextPage,
    isFetchingNextPage: isFetchingNextPending,
    isLoading: pendingLoading,
    refetch: refetchPending,
  } = useInfiniteQuery<PendingPageData>({
    queryKey: ["group-pending-posts", groupId],
    queryFn: async ({ pageParam }) => {
      const url = new URL(`/api/v1/groups/${groupId}/posts`, window.location.origin);
      url.searchParams.set("pending", "true");
      if (pageParam) url.searchParams.set("cursor", pageParam as string);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pending posts");
      const json = (await res.json()) as { data: PendingPageData };
      return json.data;
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: isLeaderOrCreator && isModerated,
    staleTime: 30_000,
  });

  const posts = data?.pages.flatMap((p) => p.posts) ?? [];
  const pendingPosts = pendingData?.pages.flatMap((p) => p.posts) ?? [];
  const pendingCount = pendingPosts.length;

  const handlePinToggle = useCallback(
    async (postId: string, isPinned: boolean) => {
      try {
        await fetch(`/api/v1/groups/${groupId}/posts/${postId}/pin`, {
          method: "PATCH",
          credentials: "include",
        });
        await queryClient.invalidateQueries({ queryKey: ["group-feed", groupId] });
      } catch {
        // Rollback handled by FeedItem's optimistic update
      }
    },
    [groupId, queryClient],
  );

  const handleApprove = useCallback(
    async (postId: string) => {
      await fetch(`/api/v1/groups/${groupId}/posts/${postId}/approve`, {
        method: "POST",
        credentials: "include",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["group-feed", groupId] }),
        refetchPending(),
      ]);
    },
    [groupId, queryClient, refetchPending],
  );

  return (
    <div className="space-y-4">
      {isLeaderOrCreator && isModerated && (
        <div>
          <button
            type="button"
            onClick={() => setShowPending((prev) => !prev)}
            className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 transition-colors dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
            aria-expanded={showPending}
          >
            {t("feed.reviewPending")}
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-800 dark:text-amber-100">
                {t("feed.pendingCount", { count: pendingCount })}
              </span>
            )}
          </button>

          {showPending && (
            <div className="mt-2 rounded-lg border border-border bg-card p-4 space-y-3">
              {pendingLoading && (
                <p className="text-sm text-muted-foreground">{t("feed.loading")}</p>
              )}
              {!pendingLoading && pendingCount === 0 && (
                <p className="text-sm text-muted-foreground">{t("feed.noPendingPosts")}</p>
              )}
              {!pendingLoading &&
                pendingPosts.map((post) => (
                  <div
                    key={post.id}
                    className="flex flex-col gap-2 rounded-md border border-border p-3"
                  >
                    {/* Author row */}
                    <div className="flex items-center gap-2">
                      <Link href={`/profiles/${post.authorId}`}>
                        <Avatar className="h-7 w-7">
                          <AvatarImage
                            src={post.authorPhotoUrl ?? undefined}
                            alt={post.authorDisplayName}
                          />
                          <AvatarFallback className="text-xs">
                            {post.authorDisplayName
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .toUpperCase()
                              .slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                      </Link>
                      <Link
                        href={`/profiles/${post.authorId}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {post.authorDisplayName}
                      </Link>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {new Date(post.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {/* Post text content */}
                    {post.content && <p className="text-sm line-clamp-3">{post.content}</p>}
                    {/* Media preview */}
                    {post.media.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {post.media
                          .filter((m) => m.mediaType === "image")
                          .slice(0, 4)
                          .map((m) => (
                            <img
                              key={m.id}
                              src={m.mediaUrl}
                              alt=""
                              className="h-20 w-20 rounded object-cover"
                            />
                          ))}
                        {post.media
                          .filter((m) => m.mediaType !== "image")
                          .map((m) => (
                            <span
                              key={m.id}
                              className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground"
                            >
                              {m.mediaType}
                            </span>
                          ))}
                      </div>
                    )}
                    {/* Approve button */}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleApprove(post.id)}
                        className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors min-h-[32px]"
                      >
                        {t("feed.approvePending")}
                      </button>
                    </div>
                  </div>
                ))}
              {hasPendingNextPage && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => void fetchNextPending()}
                    disabled={isFetchingNextPending}
                    className="rounded-lg border border-border bg-card px-4 py-2 text-sm hover:bg-accent transition-colors min-h-[36px]"
                  >
                    {isFetchingNextPending ? t("feed.loading") : t("feed.pendingLoadMore")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {canPost && (
        <PostComposer
          userName={viewerDisplayName}
          canCreatePost={canPost}
          photoUrl={viewerPhotoUrl}
          sort="chronological"
          filter="all"
          groupId={groupId}
        />
      )}

      {posts.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {t("feed.empty")}
        </div>
      )}

      {posts.map((post) => (
        <FeedItem
          key={post.id}
          post={post}
          currentUserId={viewerId}
          currentUserRole="MEMBER"
          sort="chronological"
          filter="all"
          onPinToggle={isLeaderOrCreator ? handlePinToggle : undefined}
        />
      ))}

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm hover:bg-accent transition-colors min-h-[36px]"
          >
            {isFetchingNextPage ? t("feed.loading") : t("feed.loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
