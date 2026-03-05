"use client";

import { useQuery } from "@tanstack/react-query";

interface ArticleViewTrackerProps {
  articleId: string;
}

export function ArticleViewTracker({ articleId }: ArticleViewTrackerProps) {
  useQuery({
    queryKey: ["article-view", articleId],
    queryFn: async () => {
      await fetch(`/api/v1/articles/${articleId}/view`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {
        // Fire-and-forget — ignore errors
      });
      return null;
    },
    retry: false,
    staleTime: Infinity,
  });

  return null;
}
