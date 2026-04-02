"use client";

import { useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { VerificationBadge } from "@/components/shared/VerificationBadge";

interface AttendeeRow {
  userId: string;
  displayName: string;
  status: "registered" | "waitlisted" | "attended" | "cancelled";
  joinedAt: string | null;
  badgeType?: "blue" | "red" | "purple" | null;
}

interface AttendeesResponse {
  attendees: AttendeeRow[];
}

interface AttendanceCheckInProps {
  eventId: string;
}

export function AttendanceCheckIn({ eventId }: AttendanceCheckInProps) {
  const t = useTranslations("Events.checkIn");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<AttendeesResponse>({
    queryKey: ["event-attendees", eventId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/events/${eventId}/attendees`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch attendees");
      const json = (await res.json()) as { data: AttendeesResponse };
      return json.data;
    },
  });

  const markMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/v1/events/${eventId}/attended`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "manual", userId }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { title?: string };
        throw new Error(json.title ?? "Failed to mark attendance");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["event-attendees", eventId] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  const attendees = (data?.attendees ?? []).filter(
    (a) => a.status === "registered" || a.status === "waitlisted" || a.status === "attended",
  );

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold text-sm">{t("title")}</h3>

      {attendees.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noAttendees")}</p>
      ) : (
        <ul className="divide-y">
          {attendees.map((attendee) => {
            const isAttended = attendee.status === "attended";
            return (
              <li key={attendee.userId} className="flex items-center justify-between py-2 text-sm">
                <span className="inline-flex items-center gap-1">
                  {attendee.displayName}
                  <VerificationBadge badgeType={attendee.badgeType} />
                </span>
                {isAttended ? (
                  <Badge variant="default">{t("alreadyAttended")}</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={markMutation.isPending}
                    onClick={() => markMutation.mutate(attendee.userId)}
                  >
                    {t("markAttended")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
