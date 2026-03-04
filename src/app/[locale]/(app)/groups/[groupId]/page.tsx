import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth/config";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { getGroupById, getGroupMember } from "@/db/queries/groups";
import { communityProfiles } from "@/db/schema/community-profiles";
import { GroupHeader } from "@/features/groups";
import { GroupDetail } from "@/features/groups/components/GroupDetail";

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

  // Hidden groups: non-members see 404 (don't reveal existence)
  const viewerMembership = await getGroupMember(groupId, session.user.id);
  if (
    group.visibility === "hidden" &&
    (!viewerMembership || viewerMembership.status !== "active")
  ) {
    redirect("/groups");
  }

  const viewerIsCreatorOrLeader =
    viewerMembership?.role === "creator" || viewerMembership?.role === "leader";

  // Fetch viewer's community profile for display name + photo
  const [viewerProfile] = await db
    .select({ displayName: communityProfiles.displayName, photoUrl: communityProfiles.photoUrl })
    .from(communityProfiles)
    .where(eq(communityProfiles.userId, session.user.id))
    .limit(1);

  // Serialize Date fields to ISO strings for the server→client component boundary
  const serializedGroup = {
    ...group,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    deletedAt: group.deletedAt?.toISOString() ?? null,
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <GroupHeader
        group={serializedGroup}
        viewerIsCreatorOrLeader={viewerIsCreatorOrLeader}
        viewerMembership={
          viewerMembership ? { role: viewerMembership.role, status: viewerMembership.status } : null
        }
      />

      <GroupDetail
        group={serializedGroup}
        viewerMembership={
          viewerMembership ? { role: viewerMembership.role, status: viewerMembership.status } : null
        }
        viewerId={session.user.id}
        viewerDisplayName={viewerProfile?.displayName ?? session.user.name ?? "Member"}
        viewerPhotoUrl={viewerProfile?.photoUrl ?? null}
      />
    </main>
  );
}
