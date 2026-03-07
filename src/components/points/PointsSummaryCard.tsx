"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";

interface PointsSummaryCardProps {
  total: number;
  thisWeek: number;
  thisMonth: number;
}

export function PointsSummaryCard({ total, thisWeek, thisMonth }: PointsSummaryCardProps) {
  const t = useTranslations("Points");

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-amber-500">{total}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("summary.total")}</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{thisWeek}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("summary.thisWeek")}</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{thisMonth}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("summary.thisMonth")}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
