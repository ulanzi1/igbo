"use client";

import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface RSVPButtonProps {
  eventId: string;
  registrationLimit: number | null;
  attendeeCount: number;
}

interface RsvpStatus {
  status: "registered" | "waitlisted" | "attended" | "cancelled" | null;
  waitlistPosition: number | null;
}

export function RSVPButton({ eventId, registrationLimit, attendeeCount }: RSVPButtonProps) {
  const t = useTranslations("Events");
  const tCommon = useTranslations("Common");
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);

  const { data: rsvpData, isLoading } = useQuery<RsvpStatus>({
    queryKey: ["event-rsvp", eventId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/events/${eventId}/rsvp`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch RSVP status");
      const json = (await res.json()) as { data: RsvpStatus };
      return json.data;
    },
    enabled: !!session,
  });

  const rsvpMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/events/${eventId}/rsvp`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const json = (await res.json()) as { title?: string };
        throw new Error(json.title ?? "Failed to RSVP");
      }
      return res.json() as Promise<{ data: { status: string; waitlistPosition: number | null } }>;
    },
    onSuccess: async (data) => {
      const result = data.data;
      if (result.status === "waitlisted" && result.waitlistPosition !== null) {
        toast.success(t("rsvp.waitlisted", { position: result.waitlistPosition }));
      } else {
        toast.success(t("rsvp.registered"));
      }
      await queryClient.invalidateQueries({ queryKey: ["event-rsvp", eventId] });
    },
    onError: () => {
      toast.error(t("rsvp.error"));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/events/${eventId}/rsvp`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to cancel RSVP");
    },
    onSuccess: async () => {
      toast.success(t("rsvp.cancelSuccess"));
      setCancelOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["event-rsvp", eventId] });
    },
    onError: () => {
      toast.error(t("rsvp.cancelError"));
    },
  });

  if (!session) {
    return (
      <Link
        href="/auth/sign-in"
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        {t("rsvp.signInToRsvp")}
      </Link>
    );
  }

  if (isLoading) {
    return (
      <Button disabled variant="outline" size="sm">
        {tCommon("loading")}
      </Button>
    );
  }

  const status = rsvpData?.status ?? null;
  const waitlistPosition = rsvpData?.waitlistPosition ?? null;

  const spotsLeft = registrationLimit !== null ? registrationLimit - attendeeCount : null;

  const isRegistered = status === "registered";
  const isWaitlisted = status === "waitlisted";
  const canRsvp = status === null || status === "cancelled" || status === "attended";

  return (
    <div className="flex flex-col gap-2">
      {/* Spots left indicator */}
      {spotsLeft !== null && spotsLeft < 10 && spotsLeft > 0 && (
        <p className="text-xs text-amber-600 font-medium">
          {t("rsvp.spotsLeft", { count: spotsLeft })}
        </p>
      )}

      {/* Status chips */}
      {isRegistered && (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 self-start">
          {t("rsvp.alreadyRegistered")}
        </Badge>
      )}
      {isWaitlisted && waitlistPosition !== null && (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 self-start">
          {t("rsvp.alreadyWaitlisted", { position: waitlistPosition })}
        </Badge>
      )}

      {/* Action buttons */}
      {canRsvp && (
        <Button size="sm" onClick={() => rsvpMutation.mutate()} disabled={rsvpMutation.isPending}>
          {rsvpMutation.isPending ? t("rsvp.confirming") : t("rsvp.button")}
        </Button>
      )}

      {(isRegistered || isWaitlisted) && (
        <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm">
              {t("rsvp.cancelButton")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("rsvp.cancelConfirm")}</AlertDialogTitle>
              <AlertDialogDescription>{t("rsvp.cancelDescription")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? t("rsvp.cancelling") : t("rsvp.cancelButton")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
