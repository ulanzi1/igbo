"use client";

import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EventCard } from "./EventCard";
import { RSVPButton } from "./RSVPButton";
import type { EventListItem, MyRsvpEventListItem } from "@igbo/db/queries/events";

interface EventsPageTabsProps {
  initialUpcomingEvents: EventListItem[];
}

export function EventsPageTabs({ initialUpcomingEvents }: EventsPageTabsProps) {
  const t = useTranslations("Events");
  const tCommon = useTranslations("Common");
  const { data: session } = useSession();
  const [pastEnabled, setPastEnabled] = useState(false);
  const [myRsvpsEnabled, setMyRsvpsEnabled] = useState(false);

  const { data: pastData, isError: pastError } = useQuery<{ events: EventListItem[] }>({
    queryKey: ["events-past"],
    queryFn: async () => {
      const res = await fetch("/api/v1/events?view=past");
      if (!res.ok) throw new Error("Failed to fetch past events");
      const json = (await res.json()) as { data: { events: EventListItem[] } };
      return json.data;
    },
    enabled: pastEnabled,
  });

  const { data: myRsvpsData, isError: myRsvpsError } = useQuery<{ events: MyRsvpEventListItem[] }>({
    queryKey: ["events-my-rsvps"],
    queryFn: async () => {
      const res = await fetch("/api/v1/events?view=my-rsvps", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch my RSVPs");
      const json = (await res.json()) as { data: { events: MyRsvpEventListItem[] } };
      return json.data;
    },
    enabled: myRsvpsEnabled && !!session,
  });

  const pastEvents = pastData?.events ?? [];
  const myRsvps = myRsvpsData?.events ?? [];

  return (
    <Tabs
      defaultValue="upcoming"
      onValueChange={(value) => {
        if (value === "past") setPastEnabled(true);
        if (value === "my-rsvps") setMyRsvpsEnabled(true);
      }}
    >
      <TabsList className="mb-6">
        <TabsTrigger value="upcoming">{t("list.upcoming")}</TabsTrigger>
        {session && <TabsTrigger value="my-rsvps">{t("list.myRsvps")}</TabsTrigger>}
        <TabsTrigger value="past">{t("list.past")}</TabsTrigger>
      </TabsList>

      <TabsContent value="upcoming">
        {initialUpcomingEvents.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">{t("list.empty")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {initialUpcomingEvents.map((event) => (
              <div key={event.id} className="flex flex-col gap-2">
                <EventCard event={event} />
                <div className="px-1">
                  <RSVPButton
                    eventId={event.id}
                    registrationLimit={event.registrationLimit}
                    attendeeCount={event.attendeeCount}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      {session && (
        <TabsContent value="my-rsvps">
          {myRsvpsError ? (
            <p className="text-destructive text-center py-12">{tCommon("error")}</p>
          ) : myRsvps.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">{t("myRsvps.empty")}</p>
          ) : (
            <div className="flex flex-col gap-4">
              {myRsvps.map((event) => (
                <div key={event.id} className="flex flex-col gap-2">
                  <EventCard event={event} />
                  {event.rsvpStatus === "cancelled" ? (
                    <div className="px-1 space-y-1">
                      <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                        {t("myRsvps.cancelledBadge")}
                      </span>
                      {event.cancellationReason && (
                        <p className="text-xs text-muted-foreground">
                          {t("myRsvps.cancelledReason", { reason: event.cancellationReason })}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="px-1">
                      <RSVPButton
                        eventId={event.id}
                        registrationLimit={event.registrationLimit}
                        attendeeCount={event.attendeeCount}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      )}

      <TabsContent value="past">
        {pastError ? (
          <p className="text-destructive text-center py-12">{tCommon("error")}</p>
        ) : pastEvents.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">{t("past.empty")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {pastEvents.map((event) => (
              <div key={event.id}>
                <EventCard event={event} />
              </div>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
