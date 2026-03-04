import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth/config";
import { GroupList } from "@/features/groups";

export const dynamic = "force-dynamic"; // Personalized — never cache at SSR level

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Groups" });
  return { title: t("title") };
}

export default async function GroupsPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const isTopTier = session.user.membershipTier === "TOP_TIER";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <GroupList canCreateGroup={isTopTier} />
    </main>
  );
}
