"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDensity, DENSITY_STYLES } from "@/providers/density-context";
import { cn } from "@/lib/utils";
import type { DashboardSummary } from "@/services/admin-review-service";

interface Props {
  summary: DashboardSummary;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (remainingMins === 0) return `${hours}h`;
  return `${hours}h ${remainingMins}m`;
}

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function AdminDashboardSummary({ summary }: Props) {
  const t = useTranslations("Portal.admin");
  const { density } = useDensity();
  const densityClass = DENSITY_STYLES[density];

  return (
    <div
      className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", densityClass)}
      aria-label={t("reviewQueue")}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("pendingReviews")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold" aria-label={t("pendingReviews")}>
            {summary.pendingCount}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("reviewedToday")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{summary.reviewsToday}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("avgReviewTime")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            {summary.avgReviewTimeMs != null
              ? formatDuration(summary.avgReviewTimeMs)
              : t("noAvgTime")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("decisionBreakdown")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-green-600">
              {t("approved")}: {formatPercent(summary.approvalRate)}
            </span>
            <span className="text-red-600">
              {t("rejected")}: {formatPercent(summary.rejectionRate)}
            </span>
            <span className="text-amber-600">
              {t("changesRequested")}: {formatPercent(summary.changesRequestedRate)}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminDashboardSummarySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent>
            <div className="h-8 w-16 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
