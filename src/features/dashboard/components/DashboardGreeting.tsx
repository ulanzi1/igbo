"use client";

import { useTranslations } from "next-intl";
import { useNotifications } from "@/hooks/use-notifications";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardGreetingProps {
  displayName: string;
  avatarUrl?: string | null;
}

export function DashboardGreeting({ displayName, avatarUrl }: DashboardGreetingProps) {
  const t = useTranslations("Dashboard");
  const { unreadCount, isLoading } = useNotifications();

  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-4">
      <Avatar size="lg">
        <AvatarImage src={avatarUrl ?? undefined} alt={displayName} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t("greeting.welcome", { name: displayName })}
        </h1>
        <p className="text-sm text-muted-foreground">{t("greeting.subtitle")}</p>
        <div className="text-sm text-muted-foreground" aria-live="polite" aria-atomic="true">
          {isLoading ? (
            <Skeleton className="inline-block h-4 w-32" />
          ) : unreadCount > 0 ? (
            t("stats.notifications", { count: unreadCount })
          ) : (
            t("stats.noNotifications")
          )}
        </div>
      </div>
    </div>
  );
}
