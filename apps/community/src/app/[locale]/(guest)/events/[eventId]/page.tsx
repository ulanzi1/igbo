import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getEventById } from "@igbo/db/queries/events";
import { getGroupById } from "@igbo/db/queries/groups";
import { EventFormatBadge } from "@/features/events/components/EventFormatBadge";
import { EventStatusBadge } from "@/features/events/components/EventStatusBadge";
import { EventMembershipGate } from "@/features/events/components/EventMembershipGate";
import { EventDetailActions } from "@/features/events/components/EventDetailActions";
import { RSVPButton } from "@/features/events";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await getEventById(eventId);
  if (!event) return {};
  return { title: `${event.title} — OBIGBO` };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ locale: string; eventId: string }>;
}) {
  const { locale, eventId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Events");

  // DO NOT call auth() here — defeats ISR (revalidate=60)
  // Auth-gated features (edit/cancel, group gate) use useSession() in Client Components

  const event = await getEventById(eventId);
  if (!event || event.deletedAt !== null) {
    notFound();
  }

  // Determine if this is a private/hidden group event
  let isPrivateGroupEvent = false;
  if (event.groupId && event.eventType === "group") {
    const group = await getGroupById(event.groupId);
    if (group && (group.visibility === "private" || group.visibility === "hidden")) {
      isPrivateGroupEvent = true;
    }
  }

  const formattedStart = new Intl.DateTimeFormat(locale, {
    timeZone: event.timezone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(event.startTime);

  const formattedEnd = new Intl.DateTimeFormat(locale, {
    timeZone: event.timezone,
    timeStyle: "short",
  }).format(event.endTime);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:py-16 space-y-8">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <EventFormatBadge format={event.format} />
          <EventStatusBadge status={event.status} />
          {event.recurrenceParentId && (
            <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
              {t("detail.seriesInstance")}
            </span>
          )}
        </div>

        <h1 className="text-3xl md:text-4xl font-bold">{event.title}</h1>

        <p className="text-muted-foreground">
          {formattedStart} – {formattedEnd} ({event.timezone})
        </p>

        <div className="text-sm text-muted-foreground">
          {t("detail.registered", { count: event.attendeeCount })}
          {event.registrationLimit && ` / ${event.registrationLimit}`}
        </div>
      </div>

      {event.description && (
        <div className="prose prose-sm max-w-none">
          <p>{event.description}</p>
        </div>
      )}

      {/* Location (for in-person / hybrid) */}
      {event.location && (
        <div className="text-sm">
          <span className="font-medium">{t("fields.location")}: </span>
          {event.location}
        </div>
      )}

      {/* RSVP Button — for public/general upcoming events */}
      {event.status === "upcoming" && !isPrivateGroupEvent && (
        <RSVPButton
          eventId={event.id}
          registrationLimit={event.registrationLimit}
          attendeeCount={event.attendeeCount}
        />
      )}

      {/* Meeting link / group membership gate */}
      {isPrivateGroupEvent && event.groupId ? (
        <EventMembershipGate groupId={event.groupId} meetingLink={event.meetingLink}>
          {event.status === "upcoming" && (
            <RSVPButton
              eventId={event.id}
              registrationLimit={event.registrationLimit}
              attendeeCount={event.attendeeCount}
            />
          )}
        </EventMembershipGate>
      ) : (
        event.meetingLink && (
          <div className="text-sm">
            <span className="font-medium">{t("fields.meetingLink")}: </span>
            <a
              href={event.meetingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {event.meetingLink}
            </a>
          </div>
        )
      )}

      {/* Creator actions (edit/cancel) — client component using useSession() */}
      <EventDetailActions eventId={event.id} creatorId={event.creatorId} />
    </div>
  );
}
