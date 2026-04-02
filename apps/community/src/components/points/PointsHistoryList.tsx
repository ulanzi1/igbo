"use client";

import { useTranslations, useLocale } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import type { LedgerHistoryRow } from "@igbo/db/queries/points";

interface PointsHistoryListProps {
  entries: LedgerHistoryRow[];
  loading: boolean;
}

function truncate(str: string, max = 60): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

export function PointsHistoryList({ entries, loading }: PointsHistoryListProps) {
  const t = useTranslations("Points");
  const locale = useLocale();

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">{t("history.emptyState")}</p>
    );
  }

  return (
    <div className="flex flex-col divide-y">
      {entries.map((entry) => {
        const multiplier = parseFloat(entry.multiplierApplied);
        const showMultiplier = multiplier > 1;
        const sourceTypeKey = `history.sourceTypes.${entry.sourceType}` as Parameters<typeof t>[0];
        return (
          <div key={entry.id} className="flex items-center gap-3 py-3">
            <span className="text-amber-500 font-semibold min-w-[3rem]">
              +{entry.points} {t("pointUnit", { count: entry.points })}
            </span>
            {showMultiplier && (
              <span className="text-xs bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">
                ×{multiplier}
              </span>
            )}
            <span className="text-sm flex-1">
              {t(sourceTypeKey)}
              {entry.sourceId && (
                <span className="text-muted-foreground ml-1 text-xs">
                  • {truncate(entry.sourceId)}
                </span>
              )}
            </span>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(entry.createdAt))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
