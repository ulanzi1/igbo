import { setRequestLocale, getTranslations } from "next-intl/server";
import { auth } from "@igbo/auth";
import { redirect } from "next/navigation";
import { getProfileWithSocialLinks } from "@igbo/db/queries/community-profiles";
import { PrivacySettings, SocialLinksManager } from "@/features/profiles";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Settings.privacy" });
  return { title: t("title") };
}

export default async function PrivacySettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ linked?: string; error?: string; provider?: string }>;
}) {
  const { locale } = await params;
  const sp = searchParams ? await searchParams : {};
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/${locale}/auth/login`);
  }

  const { profile, socialLinks } = await getProfileWithSocialLinks(session.user.id);

  if (!profile) {
    redirect(`/${locale}/onboarding`);
  }

  const t = await getTranslations({ locale, namespace: "Settings.privacy" });

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">{t("heading")}</h1>

      <section className="rounded-lg border border-gray-200 p-6">
        <PrivacySettings
          initialVisibility={profile.profileVisibility}
          initialLocationVisible={profile.locationVisible}
        />
      </section>

      <section className="rounded-lg border border-gray-200 p-6">
        <SocialLinksManager
          socialLinks={socialLinks}
          linkedParam={sp.linked ?? null}
          errorParam={sp.error ?? null}
        />
      </section>
    </main>
  );
}
