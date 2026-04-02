import { setRequestLocale, getTranslations } from "next-intl/server";
import { auth } from "@/server/auth/config";
import { redirect } from "next/navigation";
import { getProfileByUserId } from "@/db/queries/community-profiles";
import { EditProfileForm, RetakeTourButton } from "@/features/profiles";

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

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/${locale}/auth/login`);
  }

  const t = await getTranslations({ locale, namespace: "Settings.profile" });
  const profile = await getProfileByUserId(session.user.id);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{t("heading")}</h1>
      <section className="space-y-8 rounded-lg border border-gray-200 p-6">
        {profile ? (
          <EditProfileForm initialProfile={profile} />
        ) : (
          <p className="text-sm text-gray-500">{t("heading")}</p>
        )}
        <RetakeTourButton />
      </section>
    </main>
  );
}
