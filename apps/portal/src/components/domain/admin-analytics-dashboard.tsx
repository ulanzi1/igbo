"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AdminAnalyticsMetricCard } from "./admin-analytics-metric-card";
import type { PlatformAnalytics } from "@/services/admin-analytics-service";

interface Props {
  analytics: PlatformAnalytics;
}

export function AdminAnalyticsDashboard({ analytics }: Props) {
  const t = useTranslations("Portal.admin");
  const { postings, applications, hiring, users, review } = analytics;

  return (
    <div className="space-y-8">
      {/* Postings section */}
      <section aria-label={t("analyticsPostingsTitle")}>
        <h2 className="mb-4 text-lg font-semibold">{t("analyticsPostingsTitle")}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminAnalyticsMetricCard
            title={t("analyticsActivePostings")}
            value={postings.activeCount.value}
            trend={postings.activeCount.trend}
          />
          <AdminAnalyticsMetricCard
            title={t("analyticsPendingReview")}
            value={postings.pendingReviewCount.value}
            trend={postings.pendingReviewCount.trend}
          />
          <AdminAnalyticsMetricCard
            title={t("analyticsRejectedLast30")}
            value={postings.rejectedCount.value}
            trend={postings.rejectedCount.trend}
          />
          <AdminAnalyticsMetricCard
            title={t("analyticsExpiredLast30")}
            value={postings.expiredCount.value}
            trend={postings.expiredCount.trend}
          />
        </div>
      </section>

      {/* Applications section */}
      <section aria-label={t("analyticsApplicationsTitle")}>
        <h2 className="mb-4 text-lg font-semibold">{t("analyticsApplicationsTitle")}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AdminAnalyticsMetricCard
            title={t("analyticsSubmittedLast30")}
            value={applications.submittedCount.value}
            trend={applications.submittedCount.trend}
          />
          <AdminAnalyticsMetricCard
            title={t("analyticsAvgPerPosting")}
            value={applications.avgPerPosting.value}
            trend={applications.avgPerPosting.trend}
            formatAs="number"
          />
          <AdminAnalyticsMetricCard
            title={t("analyticsInterviewRate")}
            value={applications.interviewConversionRate.value}
            trend={applications.interviewConversionRate.trend}
            formatAs="percent"
          />
        </div>
      </section>

      {/* Hiring section */}
      <section aria-label={t("analyticsHiringTitle")}>
        <h2 className="mb-4 text-lg font-semibold">{t("analyticsHiringTitle")}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AdminAnalyticsMetricCard
            title={t("analyticsTimeToFill")}
            value={hiring.medianTimeToFillDays.value}
            trend={hiring.medianTimeToFillDays.trend}
            formatAs="days"
          />
          <AdminAnalyticsMetricCard
            title={t("analyticsHiresLast30")}
            value={hiring.hiresCount.value}
            trend={hiring.hiresCount.trend}
          />
          <AdminAnalyticsMetricCard
            title={t("analyticsOfferAcceptRate")}
            value={hiring.offerAcceptRate.value}
            trend={hiring.offerAcceptRate.trend}
            formatAs="percent"
          />
        </div>
      </section>

      {/* Users section */}
      <section aria-label={t("analyticsUsersTitle")}>
        <h2 className="mb-4 text-lg font-semibold">{t("analyticsUsersTitle")}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AdminAnalyticsMetricCard
            title={t("analyticsActiveSeekers")}
            value={users.activeSeekers.value}
            trend={users.activeSeekers.trend}
          />
          <AdminAnalyticsMetricCard
            title={t("analyticsActiveEmployers")}
            value={users.activeEmployers.value}
            trend={users.activeEmployers.trend}
          />
          <AdminAnalyticsMetricCard
            title={t("analyticsNewRegistrations")}
            value={users.newRegistrations.value}
            trend={users.newRegistrations.trend}
          />
        </div>
      </section>

      {/* Review performance section */}
      <section aria-label={t("analyticsReviewTitle")}>
        <h2 className="mb-4 text-lg font-semibold">{t("analyticsReviewTitle")}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminAnalyticsMetricCard
            title={t("analyticsAvgReviewTime")}
            value={review.avgReviewTimeMs}
            formatAs="duration"
          />
          <AdminAnalyticsMetricCard
            title={t("analyticsApprovalRate")}
            value={review.approvalRate.value}
            trend={review.approvalRate.trend}
            formatAs="percent"
          />
          <AdminAnalyticsMetricCard
            title={t("analyticsRejectionRate")}
            value={review.rejectionRate.value}
            trend={review.rejectionRate.trend}
            formatAs="percent"
          />
          <AdminAnalyticsMetricCard
            title={t("analyticsChangesRequestedRate")}
            value={review.changesRequestedRate.value}
            trend={review.changesRequestedRate.trend}
            formatAs="percent"
          />
        </div>
      </section>
    </div>
  );
}

export function AdminAnalyticsDashboardSkeleton() {
  return (
    <div className="space-y-8">
      {[4, 3, 3, 3, 4].map((count, sectionIdx) => (
        <div key={sectionIdx}>
          <Skeleton className="mb-4 h-6 w-32" />
          <div
            className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${count === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
          >
            {Array.from({ length: count }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
