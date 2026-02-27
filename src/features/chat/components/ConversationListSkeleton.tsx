"use client";

import { useTranslations } from "next-intl";

export function ConversationListSkeleton() {
  const t = useTranslations("Chat");
  return (
    <div className="flex flex-col gap-0" aria-label={t("conversations.loading")} aria-busy="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border">
          {/* Avatar skeleton */}
          <div className="h-10 w-10 flex-shrink-0 rounded-full bg-muted animate-pulse" />
          {/* Text skeleton */}
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3.5 w-24 rounded bg-muted animate-pulse" />
            <div className="h-3 w-40 rounded bg-muted animate-pulse" />
          </div>
          {/* Time skeleton */}
          <div className="h-3 w-10 rounded bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  );
}
