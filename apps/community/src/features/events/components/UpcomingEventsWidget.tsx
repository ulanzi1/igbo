"use client";

import { useTranslations, useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/i18n/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MyRsvpEventListItem } from "@igbo/db/queries/events";

export function UpcomingEventsWidget() {
  const t = useTranslations("Events");
  const locale = useLocale();
  const { data: session } = useSession();

  const { data, isLoading } = useQuery<{ events: MyRsvpEventListItem[] }>({
    queryKey: ["upcoming-events-widget"],
    queryFn: async () => {
      const res = await fetch("/api/v1/events?view=my-rsvps&limit=3", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch upcoming events");
      const json = (await res.json()) as { data: { events: MyRsvpEventListItem[] } };
      return json.data;
    },
    enabled: !!session,
  });

  if (!session) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{t("widget.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !data?.events.length ? (
          <p className="text-sm text-muted-foreground">{t("widget.empty")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {data.events.map((event) => (
              <div key={event.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/events/${event.id}`}
                    className="text-sm font-medium leading-snug hover:text-primary transition-colors truncate block"
                  >
                    {event.title}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Intl.DateTimeFormat(locale, {
                      timeZone: event.timezone,
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(event.startTime))}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    event.rsvpStatus === "registered"
                      ? "text-green-700 border-green-200 bg-green-50 shrink-0"
                      : "text-amber-700 border-amber-200 bg-amber-50 shrink-0"
                  }
                >
                  {event.rsvpStatus === "registered"
                    ? t("status.upcoming")
                    : `#${event.waitlistPosition ?? "?"}`}
                </Badge>
              </div>
            ))}
            <Link href="/events" className="text-xs text-primary hover:underline mt-1 block">
              {t("widget.viewAll")}
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
