import { setRequestLocale, getTranslations } from "next-intl/server";
import { auth } from "@/server/auth/config";
import { redirect } from "next/navigation";
import { getProfileByUserId } from "@/db/queries/community-profiles";
import { DiscoverContent } from "@/features/discover/components/DiscoverContent";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Discover" });
  return { title: t("pageTitle") };
}

export default async function DiscoverPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/${locale}/auth/login`);
    return null;
  }

  const profile = await getProfileByUserId(session.user.id);

  const viewerProfile = profile
    ? {
        locationCity: profile.locationCity ?? null,
        locationState: profile.locationState ?? null,
        locationCountry: profile.locationCountry ?? null,
        interests: (profile.interests as string[]) ?? [],
      }
    : null;

  const t = await getTranslations({ locale, namespace: "Discover" });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
      <DiscoverContent viewerProfile={viewerProfile} />
    </div>
  );
}
