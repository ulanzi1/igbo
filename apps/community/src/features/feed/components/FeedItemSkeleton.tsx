export function FeedItemSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg border border-border bg-card p-4 space-y-3"
      aria-hidden="true"
    >
      {/* Author row */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-muted" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3 w-32 rounded bg-muted" />
          <div className="h-3 w-20 rounded bg-muted" />
        </div>
      </div>
      {/* Content lines */}
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-4/5 rounded bg-muted" />
        <div className="h-3 w-3/5 rounded bg-muted" />
      </div>
      {/* Action row */}
      <div className="flex gap-4 pt-1">
        <div className="h-3 w-12 rounded bg-muted" />
        <div className="h-3 w-14 rounded bg-muted" />
        <div className="h-3 w-10 rounded bg-muted" />
      </div>
    </div>
  );
}
