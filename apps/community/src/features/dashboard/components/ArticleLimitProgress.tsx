"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";

interface ArticleLimitData {
  effectiveLimit: number;
  weeklyUsed: number;
  currentPoints: number;
  nextThreshold: number | null;
  nextEffectiveLimit: number | null;
}

export function ArticleLimitProgress() {
  const t = useTranslations("Points");
  const { data: session } = useSession();

  const { data, isLoading } = useQuery<ArticleLimitData>({
    queryKey: ["article-limit"],
    queryFn: async () => {
      const res = await fetch("/api/v1/user/article-limit", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch article limit");
      const json = (await res.json()) as { data: ArticleLimitData };
      return json.data;
    },
    enabled: !!session,
  });

  if (!session) return null;

  if (isLoading) {
    return <Skeleton className="h-12 w-full" />;
  }

  if (!data || data.effectiveLimit === 0) {
    return <p className="text-sm text-muted-foreground">{t("articleLimit.notEligible")}</p>;
  }

  const isAtMax = data.nextThreshold === null;
  const pointsNeeded = data.nextThreshold !== null ? data.nextThreshold - data.currentPoints : null;

  return (
    <div className="rounded-lg border p-4 text-sm">
      <p className="font-medium mb-1">{t("articleLimit.title")}</p>
      <p className="text-muted-foreground">
        {t("articleLimit.canPublish", { limit: data.effectiveLimit })}
      </p>
      <p className="text-muted-foreground">
        {t("articleLimit.used", { used: data.weeklyUsed, limit: data.effectiveLimit })}
      </p>
      {isAtMax ? (
        <p className="text-amber-600 mt-1">{t("articleLimit.atMax")}</p>
      ) : (
        <p className="text-muted-foreground mt-1">
          {t("articleLimit.earnMore", {
            points: pointsNeeded!,
            next: data.nextEffectiveLimit!,
          })}
        </p>
      )}
    </div>
  );
}
