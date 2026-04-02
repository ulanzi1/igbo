"use client";

import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { RecommendedGroupItem } from "@igbo/db/queries/recommendations";

export function RecommendedGroupsWidget() {
  const t = useTranslations("Groups");
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ groups: RecommendedGroupItem[] }>({
    queryKey: ["recommended-groups"],
    queryFn: async () => {
      const res = await fetch("/api/v1/groups/recommendations", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch recommended groups");
      const json = (await res.json()) as { data: { groups: RecommendedGroupItem[] } };
      return json.data;
    },
    enabled: !!session,
  });

  if (!session) return null;

  async function handleDismiss(group: RecommendedGroupItem) {
    const res = await fetch(`/api/v1/groups/recommendations/${group.id}/dismiss`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      await queryClient.invalidateQueries({ queryKey: ["recommended-groups"] });
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{t("recommendations.widgetTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !data?.groups.length ? (
          <p className="text-sm text-muted-foreground">{t("recommendations.empty")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {data.groups.map((group) => (
              <div key={group.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/groups/${group.id}`}
                    className="text-sm font-medium leading-snug hover:text-primary transition-colors truncate block"
                  >
                    {group.name}
                  </Link>
                  {group.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {group.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {t("memberCount", { count: group.memberCount })}
                    </span>
                    {group.visibility === "private" ? (
                      <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                        {t("requestToJoin")}
                      </span>
                    ) : group.joinType === "open" ? (
                      <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
                        {t("joinButton")}
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDismiss(group)}
                  aria-label={t("recommendations.dismissAriaLabel", { name: group.name })}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
