import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { auth } from "@/server/auth/config";
import { getPublicProfileForViewer } from "@/db/queries/community-profiles";
import { ProfileView } from "@/features/profiles";
import type { Metadata } from "next";

export const revalidate = 300;

type ViewerRole = "MEMBER" | "ADMIN" | "MODERATOR";

function isViewerRole(role: unknown): role is ViewerRole {
  return role === "MEMBER" || role === "ADMIN" || role === "MODERATOR";
}

interface Props {
  params: Promise<{ locale: string; userId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, userId } = await params;
  const session = await auth();
  if (!session?.user?.id) return {};

  const viewerRole = isViewerRole(session.user.role) ? session.user.role : "MEMBER";
  const { profile } = await getPublicProfileForViewer(session.user.id, userId, viewerRole);

  if (!profile) return {};

  const t = await getTranslations({ locale, namespace: "Profile" });
  return {
    title: profile.displayName,
    description: profile.bio ?? t("noSocialLinks"),
  };
}

export default async function ProfilePage({ params }: Props) {
  const { locale, userId } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) {
    notFound();
  }

  const viewerRole = isViewerRole(session.user.role) ? session.user.role : "MEMBER";
  const { profile, socialLinks } = await getPublicProfileForViewer(
    session.user.id,
    userId,
    viewerRole,
  );

  if (!profile) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <ProfileView profile={profile} socialLinks={socialLinks} />
    </main>
  );
}
