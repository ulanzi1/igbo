"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
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
}

interface FeedPageData {
  posts: FeedPost[];
  nextCursor: string | null;
}

export function GroupFeedTab({
  groupId,
  viewerId,
  viewerRole,
  viewerDisplayName,
  viewerPhotoUrl,
  canPost,
}: GroupFeedTabProps) {
  const t = useTranslations("Groups");
  const queryClient = useQueryClient();
  const isLeaderOrCreator = viewerRole === "leader" || viewerRole === "creator";

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

  const posts = data?.pages.flatMap((p) => p.posts) ?? [];

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

  return (
    <div className="space-y-4">
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
