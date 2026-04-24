"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversationList } from "@/hooks/use-conversation-list";
import { ConversationListItem } from "./ConversationListItem";

export function ConversationListView() {
  const t = useTranslations("Portal.messages");
  const { conversations, isLoading, hasMore, loadMore } = useConversationList();
  const sentinelRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (!hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  if (isLoading && conversations.length === 0) {
    return (
      <div className="flex flex-col gap-3 p-4" data-testid="conversations-loading">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!isLoading && conversations.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 text-center"
        data-testid="conversations-empty"
      >
        <p className="text-sm text-muted-foreground">{t("noConversations")}</p>
      </div>
    );
  }

  return (
    <div>
      <ul role="list" className="divide-y divide-border" data-testid="conversations-list">
        {conversations.map((conv) => (
          <ConversationListItem key={conv.id} conversation={conv} />
        ))}
      </ul>

      {hasMore && <div ref={sentinelRef} className="h-4" data-testid="conversations-sentinel" />}
    </div>
  );
}
