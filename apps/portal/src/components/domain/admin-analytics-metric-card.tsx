"use client";

import { useTranslations, useLocale } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDensity, DENSITY_STYLES } from "@/providers/density-context";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format-duration";
import { AdminAnalyticsTrend } from "./admin-analytics-trend";
import type { TrendData } from "@/services/admin-analytics-service";

export type MetricFormat = "number" | "percent" | "duration" | "days";

interface Props {
  title: string;
  value: number | null;
  trend?: TrendData | null;
  formatAs?: MetricFormat;
}

export function AdminAnalyticsMetricCard({ title, value, trend, formatAs = "number" }: Props) {
  const { density } = useDensity();
  const densityClass = DENSITY_STYLES[density];
  const t = useTranslations("Portal.admin");
  const locale = useLocale();

  let formatted: string;
  if (value === null) {
    formatted = "N/A";
  } else {
    switch (formatAs) {
      case "percent":
        formatted = `${Math.round(value * 100)}%`;
        break;
      case "duration":
        formatted = formatDuration(value);
        break;
      case "days":
        formatted = t("analyticsDays", { count: Math.round(value) });
        break;
      case "number":
      default:
        formatted = value.toLocaleString(locale);
    }
  }

  return (
    <Card className={cn(densityClass)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold" aria-label={title}>
          {formatted}
        </p>
        {trend !== undefined && (
          <div className="mt-1">
            <AdminAnalyticsTrend trend={trend ?? null} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
