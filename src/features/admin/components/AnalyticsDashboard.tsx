"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";

interface LiveData {
  currentlyOnline: number;
  todayPartialDau: number;
}

interface SummaryData {
  dau: number;
  mau: number;
  dauMauRatio: number;
  registrations: number;
  approvals: number;
  netGrowth: number;
}

interface GrowthPoint {
  date: string;
  value: number;
}

interface GrowthData {
  registrations: GrowthPoint[];
  approvals: GrowthPoint[];
  netGrowth: GrowthPoint[];
}

interface EngagementData {
  posts: number;
  messages: number;
  articles: number;
  events: number;
  avgEventAttendance: number;
}

interface CountryData {
  name: string;
  count: number;
  cities: { name: string; count: number }[];
}

interface GeoBreakdown {
  countries: CountryData[];
}

interface TierBreakdown {
  tiers: Record<string, number>;
}

interface TopContentItem {
  id: string;
  preview: string;
  engagement: number;
  createdAt: string;
}

interface TopContentData {
  items: TopContentItem[];
}

interface AnalyticsResponse {
  data: {
    dateRange: { fromDate: string; toDate: string };
    live: LiveData;
    summary: SummaryData;
    growth: GrowthData;
    engagement: EngagementData;
    geoBreakdown: GeoBreakdown | null;
    tierBreakdown: TierBreakdown | null;
    topContent: TopContentData | null;
  };
}

interface LiveResponse {
  data: { live: LiveData };
}

const LIVE_REFETCH_INTERVAL_MS = 60_000;

function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string | number;
  description?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-4">
      <div className="text-sm text-zinc-400 mb-1">{label}</div>
      <div className="text-2xl font-bold text-white" aria-label={`${label}: ${value}`}>
        {value}
      </div>
      {description && <div className="text-xs text-zinc-500 mt-1">{description}</div>}
    </div>
  );
}

function GrowthTable({
  data,
  t,
}: {
  data: GrowthData;
  t: ReturnType<typeof useTranslations<"Admin">>;
}) {
  const allDates = Array.from(
    new Set([
      ...data.registrations.map((r) => r.date),
      ...data.approvals.map((r) => r.date),
      ...data.netGrowth.map((r) => r.date),
    ]),
  ).sort();

  const regMap = Object.fromEntries(data.registrations.map((r) => [r.date, r.value]));
  const appMap = Object.fromEntries(data.approvals.map((r) => [r.date, r.value]));
  const netMap = Object.fromEntries(data.netGrowth.map((r) => [r.date, r.value]));

  if (allDates.length === 0) {
    return <p className="text-zinc-400 text-sm py-4">{t("analytics.noData")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label={t("analytics.growth.tableLabel")}>
        <caption className="sr-only">{t("analytics.growth.tableCaption")}</caption>
        <thead>
          <tr className="border-b border-zinc-700 text-zinc-400 text-left">
            <th className="pb-2 pr-4 font-medium">{t("analytics.growth.date")}</th>
            <th className="pb-2 pr-4 font-medium">{t("analytics.growth.registrations")}</th>
            <th className="pb-2 pr-4 font-medium">{t("analytics.growth.approvals")}</th>
            <th className="pb-2 font-medium">{t("analytics.growth.netGrowth")}</th>
          </tr>
        </thead>
        <tbody>
          {allDates.slice(-14).map((date) => (
            <tr key={date} className="border-b border-zinc-800">
              <td className="py-2 pr-4 text-zinc-300">{date}</td>
              <td className="py-2 pr-4 text-zinc-200">{regMap[date] ?? 0}</td>
              <td className="py-2 pr-4 text-zinc-200">{appMap[date] ?? 0}</td>
              <td className="py-2 text-zinc-200">{netMap[date] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalyticsDashboard() {
  const t = useTranslations("Admin");
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d.toISOString().slice(0, 10);
  })();

  const [fromDate, setFromDate] = useState(thirtyDaysAgo);
  const [toDate, setToDate] = useState(today);

  const dashboardQuery = useQuery<AnalyticsResponse>({
    queryKey: ["admin", "analytics", { fromDate, toDate }],
    queryFn: async () => {
      const params = new URLSearchParams({ fromDate, toDate });
      const res = await fetch(`/api/v1/admin/analytics?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load analytics");
      return res.json() as Promise<AnalyticsResponse>;
    },
  });

  const liveQuery = useQuery<LiveResponse>({
    queryKey: ["admin", "analytics", "live"],
    queryFn: async () => {
      const res = await fetch("/api/v1/admin/analytics?live=true", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load live indicators");
      return res.json() as Promise<LiveResponse>;
    },
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
  });

  const dashData = dashboardQuery.data?.data;
  const liveData = liveQuery.data?.data?.live ?? dashData?.live;

  if (dashboardQuery.isError) {
    return (
      <p className="text-red-400 py-8 text-center" role="alert">
        {t("analytics.loadError")}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* Date range filters */}
      <section aria-labelledby="analytics-filters-heading">
        <h2 id="analytics-filters-heading" className="sr-only">
          {t("analytics.filters.heading")}
        </h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label htmlFor="analytics-from-date" className="block text-sm text-zinc-400 mb-1">
              {t("analytics.filters.fromDate")}
            </label>
            <input
              id="analytics-from-date"
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-1.5 text-sm min-h-[44px]"
            />
          </div>
          <div>
            <label htmlFor="analytics-to-date" className="block text-sm text-zinc-400 mb-1">
              {t("analytics.filters.toDate")}
            </label>
            <input
              id="analytics-to-date"
              type="date"
              value={toDate}
              max={today}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-1.5 text-sm min-h-[44px]"
            />
          </div>
        </div>
      </section>

      {/* Live indicators */}
      <section aria-labelledby="live-indicators-heading">
        <h2 id="live-indicators-heading" className="text-lg font-semibold text-white mb-4">
          {t("analytics.live.heading")}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard
            label={t("analytics.live.currentlyOnline")}
            value={liveQuery.isLoading ? "—" : (liveData?.currentlyOnline ?? 0)}
          />
          <MetricCard
            label={t("analytics.live.todayDau")}
            value={liveQuery.isLoading ? "—" : (liveData?.todayPartialDau ?? 0)}
            description={t("analytics.live.todayDauNote")}
          />
        </div>
        <p className="text-xs text-zinc-500 mt-2">{t("analytics.live.refreshNote")}</p>
      </section>

      {/* Summary metrics */}
      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="text-lg font-semibold text-white mb-4">
          {t("analytics.summary.heading")}
        </h2>
        {dashboardQuery.isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 bg-zinc-800 rounded animate-pulse" aria-hidden="true" />
            ))}
          </div>
        ) : dashData ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <MetricCard label={t("analytics.summary.dau")} value={dashData.summary.dau} />
            <MetricCard label={t("analytics.summary.mau")} value={dashData.summary.mau} />
            <MetricCard
              label={t("analytics.summary.dauMauRatio")}
              value={dashData.summary.dauMauRatio.toFixed(2)}
              description={t("analytics.summary.dauMauRatioNote")}
            />
            <MetricCard
              label={t("analytics.summary.registrations")}
              value={dashData.summary.registrations}
            />
            <MetricCard
              label={t("analytics.summary.approvals")}
              value={dashData.summary.approvals}
            />
            <MetricCard
              label={t("analytics.summary.netGrowth")}
              value={dashData.summary.netGrowth}
            />
          </div>
        ) : null}
      </section>

      {/* Growth chart / table */}
      <section aria-labelledby="growth-heading">
        <h2 id="growth-heading" className="text-lg font-semibold text-white mb-4">
          {t("analytics.growth.heading")}
        </h2>
        {dashboardQuery.isLoading ? (
          <div
            className="h-48 bg-zinc-800 rounded animate-pulse"
            aria-label={t("Common.loading")}
          />
        ) : dashData ? (
          <GrowthTable data={dashData.growth} t={t} />
        ) : null}
      </section>

      {/* Geographic breakdown */}
      <section aria-labelledby="geo-heading">
        <h2 id="geo-heading" className="text-lg font-semibold text-white mb-4">
          {t("analytics.geo.heading")}
        </h2>
        {dashboardQuery.isLoading ? (
          <div className="h-32 bg-zinc-800 rounded animate-pulse" aria-hidden="true" />
        ) : dashData?.geoBreakdown?.countries && dashData.geoBreakdown.countries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label={t("analytics.geo.tableLabel")}>
              <caption className="sr-only">{t("analytics.geo.tableCaption")}</caption>
              <thead>
                <tr className="border-b border-zinc-700 text-zinc-400 text-left">
                  <th className="pb-2 pr-4 font-medium">{t("analytics.geo.country")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("analytics.geo.count")}</th>
                  <th className="pb-2 font-medium">{t("analytics.geo.topCities")}</th>
                </tr>
              </thead>
              <tbody>
                {dashData.geoBreakdown.countries.slice(0, 20).map((c) => (
                  <tr key={c.name} className="border-b border-zinc-800">
                    <td className="py-2 pr-4 text-zinc-200">{c.name}</td>
                    <td className="py-2 pr-4 text-zinc-200">{c.count}</td>
                    <td className="py-2 text-zinc-400 text-xs">
                      {c.cities
                        .slice(0, 3)
                        .map((ci) => `${ci.name} (${ci.count})`)
                        .join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-zinc-400 text-sm py-4">{t("analytics.noData")}</p>
        )}
      </section>

      {/* Tier breakdown */}
      <section aria-labelledby="tier-heading">
        <h2 id="tier-heading" className="text-lg font-semibold text-white mb-4">
          {t("analytics.tier.heading")}
        </h2>
        {dashboardQuery.isLoading ? (
          <div className="h-24 bg-zinc-800 rounded animate-pulse" aria-hidden="true" />
        ) : dashData?.tierBreakdown?.tiers ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Object.entries(dashData.tierBreakdown.tiers).map(([tier, count]) => (
              <MetricCard key={tier} label={tier} value={count} />
            ))}
          </div>
        ) : (
          <p className="text-zinc-400 text-sm py-4">{t("analytics.noData")}</p>
        )}
      </section>

      {/* Engagement metrics */}
      <section aria-labelledby="engagement-heading">
        <h2 id="engagement-heading" className="text-lg font-semibold text-white mb-4">
          {t("analytics.engagement.heading")}
        </h2>
        {dashboardQuery.isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 bg-zinc-800 rounded animate-pulse" aria-hidden="true" />
            ))}
          </div>
        ) : dashData ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <MetricCard
              label={t("analytics.engagement.posts")}
              value={dashData.engagement.posts}
              description={t("analytics.engagement.postsNote")}
            />
            <MetricCard
              label={t("analytics.engagement.messages")}
              value={dashData.engagement.messages}
              description={t("analytics.engagement.messagesNote")}
            />
            <MetricCard
              label={t("analytics.engagement.articles")}
              value={dashData.engagement.articles}
              description={t("analytics.engagement.articlesNote")}
            />
            <MetricCard
              label={t("analytics.engagement.events")}
              value={dashData.engagement.events}
              description={t("analytics.engagement.eventsNote")}
            />
            <MetricCard
              label={t("analytics.engagement.avgAttendance")}
              value={dashData.engagement.avgEventAttendance}
            />
          </div>
        ) : null}
      </section>

      {/* Top content */}
      <section aria-labelledby="top-content-heading">
        <h2 id="top-content-heading" className="text-lg font-semibold text-white mb-4">
          {t("analytics.topContent.heading")}
        </h2>
        {dashboardQuery.isLoading ? (
          <div className="h-48 bg-zinc-800 rounded animate-pulse" aria-hidden="true" />
        ) : dashData?.topContent?.items && dashData.topContent.items.length > 0 ? (
          <div className="space-y-2">
            {dashData.topContent.items.map((item) => (
              <div
                key={item.id}
                className="bg-zinc-800 border border-zinc-700 rounded p-3 flex items-center justify-between gap-4"
              >
                <span className="text-zinc-300 text-sm truncate flex-1">{item.preview || "—"}</span>
                <span
                  className="text-zinc-400 text-xs whitespace-nowrap"
                  aria-label={t("analytics.topContent.engagementLabel", { count: item.engagement })}
                >
                  {t("analytics.topContent.engagement", { count: item.engagement })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-zinc-400 text-sm py-4">{t("analytics.noData")}</p>
        )}
      </section>
    </div>
  );
}
