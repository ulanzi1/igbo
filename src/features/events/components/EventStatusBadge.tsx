"use client";

import { useTranslations } from "next-intl";

type EventStatus = "upcoming" | "live" | "completed" | "cancelled";

interface EventStatusBadgeProps {
  status: EventStatus;
}

const STATUS_CLASSES: Record<EventStatus, string> = {
  upcoming: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  live: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 animate-pulse",
  completed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 line-through",
};

export function EventStatusBadge({ status }: EventStatusBadgeProps) {
  const t = useTranslations("Events");

  return (
    <span
      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CLASSES[status]}`}
    >
      {t(`status.${status}`)}
    </span>
  );
}
