"use client";

import { useQuery } from "@tanstack/react-query";

interface EventsQueryOpts {
  groupId?: string;
  status?: string;
}

export function useEvents(opts: EventsQueryOpts = {}) {
  const params = new URLSearchParams();
  if (opts.groupId) params.set("groupId", opts.groupId);
  if (opts.status) params.set("status", opts.status);

  return useQuery({
    queryKey: ["events", opts.groupId, opts.status],
    queryFn: async () => {
      const res = await fetch(`/api/v1/events?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch events");
      const data = (await res.json()) as { data?: { events?: unknown[] } };
      return data.data?.events ?? [];
    },
  });
}

export function useEventDetail(eventId: string) {
  return useQuery({
    queryKey: ["event", eventId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/events/${eventId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch event");
      const data = (await res.json()) as { data?: { event?: unknown } };
      return data.data?.event ?? null;
    },
    enabled: !!eventId,
  });
}
