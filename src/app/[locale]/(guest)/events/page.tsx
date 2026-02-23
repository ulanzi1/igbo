import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/shared/EmptyState";
import { CalendarIcon } from "lucide-react";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "SEO" });

  return {
    title: t("eventsTitle"),
    description: t("eventsDescription"),
    alternates: {
      canonical: `/${locale}/events`,
      languages: {
        en: "/en/events",
        ig: "/ig/events",
      },
    },
    openGraph: {
      title: t("eventsTitle"),
      description: t("eventsDescription"),
      type: "website",
    },
    twitter: {
      card: "summary",
      title: t("eventsTitle"),
      description: t("eventsDescription"),
    },
  };
}

export default async function EventsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Events");

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:py-16">
      <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">{t("title")}</h1>
      <p className="text-base text-muted-foreground mb-8">{t("description")}</p>

      <EmptyState
        icon={<CalendarIcon className="size-7" aria-hidden="true" />}
        title={t("emptyTitle")}
        description={t("emptyDescription")}
        primaryAction={{
          label: t("ctaButton"),
          href: "/apply",
        }}
      />
    </div>
  );
}
