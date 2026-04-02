import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth/config";
import { getEventById } from "@/db/queries/events";
import { EventForm } from "@/features/events/components/EventForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; eventId: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Events" });
  return { title: t("edit.title") };
}

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ locale: string; eventId: string }>;
}) {
  const { eventId } = await params;

  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const event = await getEventById(eventId);
  if (!event || event.deletedAt !== null) {
    redirect("/events");
  }

  // Only the creator can edit
  if (event.creatorId !== session.user.id) {
    redirect(`/events/${eventId}`);
  }

  const t = await getTranslations("Events");

  const initialData = {
    title: event.title,
    description: event.description ?? undefined,
    format: event.format,
    timezone: event.timezone,
    startTime: event.startTime.toISOString().slice(0, 16), // datetime-local format
    endTime: event.endTime.toISOString().slice(0, 16),
    location: event.location ?? undefined,
    meetingLink: event.meetingLink ?? undefined,
    registrationLimit: event.registrationLimit ?? undefined,
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">{t("edit.title")}</h1>
      <EventForm mode="edit" initialData={initialData} eventId={eventId} />
    </main>
  );
}
