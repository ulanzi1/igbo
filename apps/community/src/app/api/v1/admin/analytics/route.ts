import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@igbo/auth/admin-auth";
import {
  getSummaryMetrics,
  getGrowthSeries,
  getEngagementMetrics,
  getLatestBreakdownSnapshot,
  currentlyOnlineUsers,
  todayPartialDau,
} from "@igbo/db/queries/analytics";

/** ISO date string YYYY-MM-DD */
function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

function defaultToDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFromDate(toDate: string): string {
  const d = new Date(toDate);
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

export const GET = withApiHandler(async (request: Request) => {
  await requireAdminSession(request);

  const url = new URL(request.url);
  const toDateParam = url.searchParams.get("toDate");
  const fromDateParam = url.searchParams.get("fromDate");
  const liveOnly = url.searchParams.get("live") === "true";

  const toDate = toDateParam ?? defaultToDate();

  if (!isValidDate(toDate)) {
    throw new ApiError({
      title: "Invalid toDate",
      detail: "toDate must be YYYY-MM-DD",
      status: 400,
    });
  }
  const fromDate = fromDateParam ?? defaultFromDate(toDate);

  if (!isValidDate(fromDate)) {
    throw new ApiError({
      title: "Invalid fromDate",
      detail: "fromDate must be YYYY-MM-DD",
      status: 400,
    });
  }
  if (fromDate > toDate) {
    throw new ApiError({
      title: "Invalid date range",
      detail: "fromDate must be before or equal to toDate",
      status: 400,
    });
  }

  // Live indicators always included
  const [online, partialDau] = await Promise.all([currentlyOnlineUsers(), todayPartialDau()]);

  if (liveOnly) {
    return successResponse({ live: { currentlyOnline: online, todayPartialDau: partialDau } });
  }

  const [summary, growth, engagement, geoBreakdown, tierBreakdown, topContent] = await Promise.all([
    getSummaryMetrics(toDate),
    getGrowthSeries(fromDate, toDate),
    getEngagementMetrics(toDate),
    getLatestBreakdownSnapshot("active_by_country"),
    getLatestBreakdownSnapshot("active_by_tier"),
    getLatestBreakdownSnapshot("top_content"),
  ]);

  return successResponse({
    dateRange: { fromDate, toDate },
    live: { currentlyOnline: online, todayPartialDau: partialDau },
    summary: {
      ...summary,
      dauMauRatio: summary.mau > 0 ? Math.round((summary.dau / summary.mau) * 100) / 100 : 0,
    },
    growth,
    engagement,
    geoBreakdown: geoBreakdown?.metadata ?? null,
    tierBreakdown: tierBreakdown?.metadata ?? null,
    topContent: topContent?.metadata ?? null,
  });
});
