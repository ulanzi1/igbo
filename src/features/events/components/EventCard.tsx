"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { EventFormatBadge } from "./EventFormatBadge";
import { EventStatusBadge } from "./EventStatusBadge";
import type { EventListItem } from "@/db/queries/events";

interface EventCardProps {
  event: EventListItem;
  showEditActions?: boolean;
}

export function EventCard({ event, showEditActions = false }: EventCardProps) {
  const t = useTranslations("Events");

  const formattedDate = new Intl.DateTimeFormat("en", {
    timeZone: event.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(event.startTime));

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/events/${event.id}`}
          className="font-semibold text-lg leading-snug hover:text-primary transition-colors"
        >
          {event.title}
        </Link>
        <EventStatusBadge status={event.status} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <EventFormatBadge format={event.format} />
        <span>{formattedDate}</span>
        <span>{t("detail.registered", { count: event.attendeeCount })}</span>
      </div>

      {event.recurrenceParentId && (
        <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 self-start">
          {t("detail.seriesLabel")}
        </span>
      )}

      {showEditActions && (
        <div className="flex items-center gap-2 mt-1">
          <Link
            href={`/events/${event.id}/edit`}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            {t("detail.editButton")}
          </Link>
        </div>
      )}
    </div>
  );
}
