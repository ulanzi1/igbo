"use client";

import { useTranslations } from "next-intl";
import { Eye } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDensity } from "@/providers/density-context";
import type { SeekerAnalyticsData } from "@/services/seeker-analytics-service";

type CategoryKey = "active" | "interviews" | "offers" | "rejected" | "withdrawn";
type BadgeVariant = "info" | "success" | "destructive" | "secondary" | "default";

const CATEGORY_VARIANT: Record<CategoryKey, BadgeVariant> = {
  active: "info",
  interviews: "info",
  offers: "success",
  rejected: "destructive",
  withdrawn: "secondary",
};

const CATEGORY_LABEL_KEY: Record<CategoryKey, string> = {
  active: "activeApplications",
  interviews: "interviews",
  offers: "offers",
  rejected: "rejected",
  withdrawn: "withdrawn",
};

const CATEGORY_KEYS: readonly CategoryKey[] = [
  "active",
  "interviews",
  "offers",
  "rejected",
  "withdrawn",
] as const;

interface SeekerAnalyticsCardProps {
  data: SeekerAnalyticsData | null;
}

export function SeekerAnalyticsCard({ data }: SeekerAnalyticsCardProps) {
  const t = useTranslations("Portal.seekerAnalytics");
  const { density } = useDensity();

  const tilePadding = density === "dense" ? "p-3" : density === "compact" ? "p-4" : "p-4";
  const sectionGap = density === "dense" ? "mb-3" : density === "compact" ? "mb-4" : "mb-6";
  const badgeGap = density === "dense" ? "gap-1.5" : "gap-2";

  const isEmpty =
    !data ||
    (data.profileViews === 0 &&
      data.totalApplications === 0 &&
      data.statusCounts.active === 0 &&
      data.statusCounts.interviews === 0 &&
      data.statusCounts.offers === 0 &&
      data.statusCounts.rejected === 0 &&
      data.statusCounts.withdrawn === 0);

  if (isEmpty) {
    return (
      <section aria-label={t("ariaLabel")}>
        <Card>
          <CardHeader>
            <CardTitle>{t("title")}</CardTitle>
          </CardHeader>
          <CardContent className="text-center py-8">
            <p className="text-lg font-medium text-muted-foreground">{t("emptyTitle")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("emptyDescription")}</p>
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {t("browseJobs")}
            </Link>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section aria-label={t("ariaLabel")}>
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Profile views tile */}
          <div className={sectionGap}>
            <div
              className={`flex items-center gap-3 rounded-lg border bg-card ${tilePadding}`}
              aria-label={t("viewsAriaLabel", { count: data.profileViews })}
            >
              <Eye className="h-5 w-5 text-primary" aria-hidden="true" />
              <div>
                <p className="text-2xl font-bold tabular-nums">{data.profileViews}</p>
                <p className="text-xs text-muted-foreground">{t("profileViews")}</p>
              </div>
            </div>
          </div>

          {/* Total applications */}
          <div
            className="mb-4"
            aria-label={t("applicationsAriaLabel", { count: data.totalApplications })}
          >
            <p className="text-sm font-medium text-muted-foreground">{t("totalApplications")}</p>
            <p className="text-xl font-bold tabular-nums">{data.totalApplications}</p>
          </div>

          {/* Status breakdown */}
          <div className={`flex flex-wrap ${badgeGap}`}>
            {CATEGORY_KEYS.map((key) => {
              const count = data.statusCounts[key];
              const variant = CATEGORY_VARIANT[key];
              const label = t(CATEGORY_LABEL_KEY[key]);
              return (
                <Badge
                  key={key}
                  variant={variant}
                  aria-label={t("statusAriaLabel", { status: label, count })}
                >
                  {label}: {count}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export function SeekerAnalyticsCardSkeleton() {
  return (
    <Card aria-hidden="true">
      <CardHeader>
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-7 w-16 mb-4" />
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-6 w-20 rounded-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
