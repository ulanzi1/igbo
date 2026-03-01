"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useDiscover } from "../hooks/use-discover";
import { MemberCard } from "./MemberCard";
import { MemberCardSkeleton } from "./MemberCardSkeleton";
import type { DiscoverFilters } from "../types";

interface MemberGridProps {
  filters: DiscoverFilters;
  viewerInterests: string[];
}

export function MemberGrid({ filters, viewerInterests }: MemberGridProps) {
  const t = useTranslations("Discover");
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data, isPending, isError, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useDiscover(filters);

  const members = data?.pages.flatMap((p) => p.members) ?? [];

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isPending) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <MemberCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-sm text-gray-600">{t("loadingError")}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-gray-500">{t("noResults")}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {members.map((member) => (
          <MemberCard key={member.userId} member={member} viewerInterests={viewerInterests} />
        ))}
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" aria-hidden="true" />

      {isFetchingNextPage && (
        <p className="py-4 text-center text-sm text-gray-500">{t("loadingMore")}</p>
      )}
    </div>
  );
}
