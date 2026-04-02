"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { PointsSummaryCard } from "@/components/points/PointsSummaryCard";
import { PointsHistoryFilter } from "@/components/points/PointsHistoryFilter";
import { PointsHistoryList } from "@/components/points/PointsHistoryList";
import { ArticleLimitProgress } from "@/features/dashboard/components/ArticleLimitProgress";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { LedgerHistoryRow } from "@/db/queries/points";

interface PointsSummary {
  total: number;
  thisWeek: number;
  thisMonth: number;
}

interface BalanceData {
  balance: number;
  summary: PointsSummary;
}

interface HistoryResponse {
  entries: LedgerHistoryRow[];
  total: number;
  page: number;
  limit: number;
}

const LIMIT = 20;

export default function PointsPage() {
  const t = useTranslations("Points");
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialType = searchParams.get("type") ?? "";
  const [activityType, setActivityType] = useState(initialType);
  const [page, setPage] = useState(1);

  const { data: balanceData, isLoading: loadingBalance } = useQuery<BalanceData>({
    queryKey: ["points-balance-page"],
    queryFn: async () => {
      const res = await fetch("/api/v1/user/points", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch points");
      const json = (await res.json()) as { data: BalanceData };
      return json.data;
    },
    enabled: !!session,
  });

  const { data: historyData, isLoading: loadingHistory } = useQuery<HistoryResponse>({
    queryKey: ["points-history", page, activityType],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (activityType) params.set("type", activityType);
      const res = await fetch(`/api/v1/user/points/history?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch history");
      const json = (await res.json()) as { data: HistoryResponse };
      return json.data;
    },
    enabled: !!session,
  });

  const balance = balanceData?.balance ?? 0;
  const summary = balanceData?.summary ?? { total: 0, thisWeek: 0, thisMonth: 0 };
  const history = historyData ?? { entries: [], total: 0, page: 1, limit: LIMIT };

  const handleFilterChange = (type: string) => {
    setActivityType(type);
    setPage(1);
    const newParams = new URLSearchParams(searchParams.toString());
    if (type) {
      newParams.set("type", type);
    } else {
      // eslint-disable-next-line drizzle/enforce-delete-with-where -- URLSearchParams.delete, not Drizzle
      newParams.delete("type");
    }
    router.replace(`?${newParams.toString()}`);
  };

  if (!session && status !== "loading") {
    return null;
  }

  if (status === "loading" || loadingBalance) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-24 w-full mb-6" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const totalPages = Math.ceil(history.total / LIMIT);

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t("history.title")}</h1>
        <Link href="/points/how-to-earn" className="text-sm text-muted-foreground hover:underline">
          {t("howToEarn.linkLabel")}
        </Link>
      </div>

      <div className="mb-6">
        <PointsSummaryCard
          total={summary.total}
          thisWeek={summary.thisWeek}
          thisMonth={summary.thisMonth}
        />
      </div>

      <div className="mb-6">
        <ArticleLimitProgress />
      </div>

      {balance === 0 && !loadingBalance && (
        <p className="text-sm text-muted-foreground mb-4">{t("widget.zeroState")}</p>
      )}

      <div className="mb-4">
        <PointsHistoryFilter activeType={activityType} onFilterChange={handleFilterChange} />
      </div>

      <PointsHistoryList entries={history.entries} loading={loadingHistory} />

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t("pagination.previous")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t("pagination.pageOf", { page, total: totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("pagination.next")}
          </Button>
        </div>
      )}
    </div>
  );
}
