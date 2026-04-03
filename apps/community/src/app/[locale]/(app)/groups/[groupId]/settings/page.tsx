import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@igbo/auth";
import { getGroupById, getGroupMember } from "@igbo/db/queries/groups";
import { GroupSettings } from "@/features/groups";

export const dynamic = "force-dynamic"; // Personalized — never cache at SSR level

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; groupId: string }>;
}) {
  const { locale, groupId } = await params;
  const [t, group] = await Promise.all([
    getTranslations({ locale, namespace: "Groups" }),
    getGroupById(groupId),
  ]);
  return { title: group ? `${group.name} — ${t("settingsTitle")}` : t("settingsTitle") };
}

export default async function GroupSettingsPage({
  params,
}: {
  params: Promise<{ locale: string; groupId: string }>;
}) {
  const { groupId } = await params;

  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const group = await getGroupById(groupId);
  if (!group) redirect("/groups");

  const membership = await getGroupMember(groupId, session.user.id);
  const isCreatorOrLeader = membership?.role === "creator" || membership?.role === "leader";

  if (!isCreatorOrLeader) redirect(`/groups/${groupId}`);

  // Serialize Date fields for the server→client component boundary
  const serializedGroup = {
    ...group,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    deletedAt: group.deletedAt?.toISOString() ?? null,
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <GroupSettings group={serializedGroup} viewerIsCreatorOrLeader={isCreatorOrLeader} />
    </main>
  );
}
