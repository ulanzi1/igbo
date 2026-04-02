import { getTranslations, setRequestLocale } from "next-intl/server";
import { listUpcomingEvents } from "@/db/queries/events";
import { EventsPageTabs } from "@/features/events";
import { CreateEventButton } from "@/features/events/components/CreateEventButton";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Events" });
  return {
    title: t("list.title"),
    alternates: {
      canonical: `/${locale}/events`,
      languages: { en: "/en/events", ig: "/ig/events" },
    },
  };
}

export default async function EventsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Events");

  // DO NOT call auth() here — defeats ISR (revalidate=60)
  // Only public/general events shown in ISR cache; auth-gated features use useSession() client-side
  const events = await listUpcomingEvents({});

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:py-16">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-primary">{t("list.title")}</h1>
        <CreateEventButton />
      </div>

      <EventsPageTabs initialUpcomingEvents={events} />
    </div>
  );
}
