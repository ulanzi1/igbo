"use client";

import { useTranslations } from "next-intl";

export function ChatWindowSkeleton() {
  const t = useTranslations("Chat");
  return (
    <div
      className="flex flex-1 flex-col gap-4 p-4 overflow-y-auto"
      aria-label={t("messages.loadingMessages")}
      aria-busy="true"
    >
      {Array.from({ length: 6 }).map((_, i) => {
        const isOwn = i % 3 === 2;
        return (
          <div
            key={i}
            className={`flex items-end gap-2 ${isOwn ? "flex-row-reverse" : "flex-row"}`}
          >
            {!isOwn && (
              <div className="h-8 w-8 flex-shrink-0 rounded-full bg-muted animate-pulse" />
            )}
            <div className={`h-10 rounded-2xl bg-muted animate-pulse ${isOwn ? "w-40" : "w-56"}`} />
          </div>
        );
      })}
    </div>
  );
}
