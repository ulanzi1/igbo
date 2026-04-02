"use client";

import { useTranslations } from "next-intl";

const FILTER_OPTIONS = [
  { value: "", labelKey: "filter.all" },
  { value: "like_received", labelKey: "filter.like_received" },
  { value: "event_attended", labelKey: "filter.event_attended" },
  { value: "article_published", labelKey: "filter.article_published" },
] as const;

interface PointsHistoryFilterProps {
  activeType: string;
  onFilterChange: (activityType: string) => void;
}

export function PointsHistoryFilter({ activeType, onFilterChange }: PointsHistoryFilterProps) {
  const t = useTranslations("Points");

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by activity type">
      {FILTER_OPTIONS.map(({ value, labelKey }) => (
        <button
          key={value}
          type="button"
          onClick={() => onFilterChange(value)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            activeType === value
              ? "bg-amber-500 text-white"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
          aria-pressed={activeType === value}
        >
          {t(labelKey as Parameters<typeof t>[0])}
        </button>
      ))}
    </div>
  );
}
