"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { EventFormatBadge } from "./EventFormatBadge";
import type { EventListItem } from "@/db/queries/events";

interface GroupEventCardProps {
  event: EventListItem;
}

export function GroupEventCard({ event }: GroupEventCardProps) {
  const t = useTranslations("Events");

  const formattedDate = new Intl.DateTimeFormat("en", {
    timeZone: event.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(event.startTime));

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1 min-w-0">
        <Link
          href={`/events/${event.id}`}
          className="font-medium text-sm leading-snug hover:text-primary transition-colors truncate"
        >
          {event.title}
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <EventFormatBadge format={event.format} />
          <span>{formattedDate}</span>
        </div>
      </div>
      {event.dateChangeType && (
        <span
          className={`shrink-0 inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${
            event.dateChangeType === "postponed"
              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
              : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
          }`}
        >
          {t(`dateChange.${event.dateChangeType}`)}
        </span>
      )}
    </div>
  );
}
