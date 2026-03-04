import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth/config";
import { getGroupById, getGroupMember } from "@/db/queries/groups";
import { GroupHeader } from "@/features/groups";
import { GroupDetailStub } from "./GroupDetailStub";

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
  return { title: group ? group.name : t("title") };
}

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ locale: string; groupId: string }>;
}) {
  const { groupId } = await params;

  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const group = await getGroupById(groupId);
  if (!group) redirect("/groups");

  const viewerMembership = await getGroupMember(groupId, session.user.id);
  const viewerIsCreatorOrLeader =
    viewerMembership?.role === "creator" || viewerMembership?.role === "leader";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <GroupHeader group={group} viewerIsCreatorOrLeader={viewerIsCreatorOrLeader} />

      {/* Stub: detailed tabs (Feed/Chat/Members/Files) implemented in Stories 5.2–5.4 */}
      <GroupDetailStub />
    </main>
  );
}
