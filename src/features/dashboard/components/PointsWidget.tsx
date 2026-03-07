"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface PointsBalanceData {
  balance: number;
  summary: { total: number; thisWeek: number; thisMonth: number };
}

export function PointsWidget() {
  const t = useTranslations("Points");
  const { data: session } = useSession();

  const { data, isLoading } = useQuery<PointsBalanceData>({
    queryKey: ["points-balance"],
    queryFn: async () => {
      const res = await fetch("/api/v1/user/points", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch points");
      const json = (await res.json()) as { data: PointsBalanceData };
      return json.data;
    },
    enabled: !!session,
  });

  const reduced = useReducedMotion();
  const balance = data?.balance ?? 0;
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (reduced || balance === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing derived animation state
      setDisplayed(balance);
      return;
    }
    const duration = 600;
    const steps = 30;
    const increment = balance / steps;
    let current = 0;
    const id = setInterval(() => {
      current = Math.min(current + increment, balance);
      setDisplayed(Math.round(current));
      if (current >= balance) clearInterval(id);
    }, duration / steps);
    return () => clearInterval(id);
  }, [balance, reduced]);

  if (!session) return null;

  return (
    <Card className="ring-1 ring-amber-500/30 border-amber-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{t("widget.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : balance === 0 ? (
          <div>
            <p className="text-2xl font-bold text-amber-500">0</p>
            <p className="text-sm text-muted-foreground mt-1">{t("widget.zeroState")}</p>
          </div>
        ) : (
          <div>
            <p
              className={`text-2xl font-bold text-amber-500${balance > 0 && !reduced ? " animate-pulse" : ""}`}
            >
              {displayed}
            </p>
            <Link href="/points" className="text-xs text-primary hover:underline mt-1 block">
              {t("history.title")}
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
