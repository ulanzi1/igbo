"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Eye, Users, TrendingUp } from "lucide-react";
import { useDensity } from "@/providers/density-context";

export interface JobAnalyticsData {
  views: number;
  applications: number;
  conversionRate: number;
  sharedToCommunity: boolean;
}

interface JobAnalyticsCardProps {
  analytics: JobAnalyticsData;
}

export function JobAnalyticsCard({ analytics }: JobAnalyticsCardProps) {
  const t = useTranslations("Portal.analytics");
  const { density } = useDensity();

  const padding = density === "dense" ? "p-3" : density === "compact" ? "p-4" : "p-6";
  const gap = density === "dense" ? "gap-3" : density === "compact" ? "gap-4" : "gap-6";

  const conversionDisplay =
    analytics.views === 0 ? t("conversionNotAvailable") : `${analytics.conversionRate.toFixed(1)}%`;

  const metrics = [
    {
      label: t("views"),
      value: analytics.views.toLocaleString(),
      icon: Eye,
      color: "text-blue-600",
    },
    {
      label: t("applications"),
      value: analytics.applications.toLocaleString(),
      icon: Users,
      color: "text-green-600",
    },
    {
      label: t("conversionRate"),
      value: conversionDisplay,
      icon: TrendingUp,
      color: "text-purple-600",
    },
  ];

  return (
    <div className={`grid grid-cols-3 ${gap}`} aria-label={t("ariaLabel")}>
      {metrics.map(({ label, value, icon: Icon, color }) => (
        <div
          key={label}
          className={`flex flex-col items-center rounded-lg border bg-card text-card-foreground shadow-sm ${padding}`}
        >
          <Icon className={`mb-2 h-5 w-5 ${color}`} aria-hidden="true" />
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  );
}

export function JobAnalyticsCardSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-6" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col items-center rounded-lg border bg-card p-6 shadow-sm">
          <div className="mb-2 h-5 w-5 animate-pulse rounded bg-muted" />
          <div className="h-8 w-16 animate-pulse rounded bg-muted" />
          <div className="mt-1 h-3 w-20 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
