"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { TrendData } from "@/services/admin-analytics-service";

interface Props {
  trend: TrendData | null;
}

export function AdminAnalyticsTrend({ trend }: Props) {
  const t = useTranslations("Portal.admin");

  if (trend === null) {
    return (
      <span className="text-xs text-muted-foreground" aria-label={t("trendNoData")}>
        {t("trendNoData")}
      </span>
    );
  }

  const { direction, percentChange } = trend;

  if (direction === "stable") {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
        aria-label={t("trendStable")}
      >
        <Minus className="size-3" aria-hidden="true" />
        {t("trendStable")}
      </span>
    );
  }

  const isUp = direction === "up";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        isUp ? "text-green-600" : "text-red-600",
      )}
      aria-label={
        isUp ? t("trendUp", { percent: percentChange }) : t("trendDown", { percent: percentChange })
      }
    >
      {isUp ? (
        <TrendingUp className="size-3" aria-hidden="true" />
      ) : (
        <TrendingDown className="size-3" aria-hidden="true" />
      )}
      {isUp ? t("trendUp", { percent: percentChange }) : t("trendDown", { percent: percentChange })}
    </span>
  );
}
