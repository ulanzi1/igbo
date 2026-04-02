"use client";

import { useTranslations } from "next-intl";
import { EventCard } from "./EventCard";
import type { EventListItem } from "@igbo/db/queries/events";

interface EventListProps {
  events: EventListItem[];
  emptyMessage?: string;
  showEditActions?: boolean;
}

export function EventList({ events, emptyMessage, showEditActions = false }: EventListProps) {
  const t = useTranslations("Events");

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <p>{emptyMessage ?? t("list.empty")}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {events.map((event) => (
        <EventCard key={event.id} event={event} showEditActions={showEditActions} />
      ))}
    </div>
  );
}
