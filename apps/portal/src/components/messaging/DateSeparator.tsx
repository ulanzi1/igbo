"use client";

import { useTranslations } from "next-intl";

interface DateSeparatorProps {
  date: Date | string;
}

function formatSeparatorDate(date: Date, t: ReturnType<typeof useTranslations>): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(d, today)) return t("today");
  if (isSameDay(d, yesterday)) return t("yesterday");

  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function DateSeparator({ date }: DateSeparatorProps) {
  const t = useTranslations("Portal.messages");
  const d = typeof date === "string" ? new Date(date) : date;
  const label = formatSeparatorDate(d, t);

  return (
    <div role="separator" aria-label={label} className="flex items-center gap-3 my-2 px-4">
      <div className="flex-1 border-t border-border" />
      <span className="text-xs text-muted-foreground select-none">{label}</span>
      <div className="flex-1 border-t border-border" />
    </div>
  );
}
