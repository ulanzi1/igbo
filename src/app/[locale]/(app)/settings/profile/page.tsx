import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { RetakeTourButton } from "@/features/profiles";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Settings.profile" });
  return { title: t("title") };
}

export default async function ProfileSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "Settings.profile" });

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{t("heading")}</h1>
      <section className="rounded-lg border border-gray-200 p-6">
        <RetakeTourButton />
      </section>
    </main>
  );
}
