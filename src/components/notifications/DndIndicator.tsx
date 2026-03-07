"use client";
import { useQuery } from "@tanstack/react-query";
import { Moon } from "lucide-react";
import { useTranslations } from "next-intl";

interface DndIndicatorProps {
  userId: string;
}

async function fetchDndStatus(userId: string): Promise<{ isDnd: boolean }> {
  const res = await fetch(`/api/v1/users/${userId}/dnd-status`);
  if (!res.ok) return { isDnd: false };
  const json = (await res.json()) as { data: { isDnd: boolean } };
  return { isDnd: json.data.isDnd };
}

export function DndIndicator({ userId }: DndIndicatorProps) {
  const t = useTranslations("Notifications.quietHours");

  const { data } = useQuery({
    queryKey: ["dnd-status", userId],
    queryFn: () => fetchDndStatus(userId),
    staleTime: 5 * 60 * 1000, // 5 min
  });

  if (!data?.isDnd) return null;

  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Moon className="h-3.5 w-3.5" aria-hidden="true" />
      {t("dndIndicator")}
    </span>
  );
}
