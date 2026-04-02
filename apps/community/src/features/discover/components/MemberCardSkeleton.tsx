"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function MemberCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {/* Avatar + Name */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 flex-shrink-0 rounded-full" />
        <div className="flex flex-col gap-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      {/* Bio */}
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      {/* Shared interests */}
      <Skeleton className="h-3 w-28" />
      {/* Message button */}
      <Skeleton className="mt-auto h-11 w-full rounded-md" />
    </div>
  );
}
