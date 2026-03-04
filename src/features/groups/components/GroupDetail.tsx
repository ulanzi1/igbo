"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GroupFeedTab } from "./GroupFeedTab";
import { GroupChannelsTab } from "./GroupChannelsTab";
import { GroupMembersTab } from "./GroupMembersTab";
import { GroupFilesTab } from "./GroupFilesTab";
import type { GroupMemberRole, GroupMemberStatus } from "@/db/schema/community-groups";

interface SerializedGroup {
  id: string;
  name: string;
  description: string | null;
  bannerUrl: string | null;
  visibility: string;
  joinType: string;
  postingPermission: string;
  commentingPermission: string;
  memberLimit: number | null;
  creatorId: string;
  memberCount: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GroupDetailProps {
  group: SerializedGroup;
  viewerMembership: { role: GroupMemberRole; status: GroupMemberStatus } | null;
  viewerId: string;
  viewerDisplayName: string;
  viewerPhotoUrl?: string | null;
}

export function GroupDetail({
  group,
  viewerMembership,
  viewerId,
  viewerDisplayName,
  viewerPhotoUrl,
}: GroupDetailProps) {
  const t = useTranslations("Groups");
  const [activeTab, setActiveTab] = useState("feed");

  const isArchived = group.deletedAt !== null;
  const isActiveMember = !isArchived && viewerMembership?.status === "active";
  const viewerRole = isActiveMember ? viewerMembership!.role : null;
  const isLeaderOrCreator = viewerRole === "leader" || viewerRole === "creator";

  // Determine if viewer can post (active member, not muted, posting permissions met)
  const canPost =
    isActiveMember &&
    !isArchived &&
    (group.postingPermission !== "leaders_only" || isLeaderOrCreator);

  if (isArchived) {
    return (
      <div className="space-y-4">
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
          data-testid="archived-banner"
        >
          {t("archived.banner")}
        </div>
        <Tabs id="group-detail-tabs" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="feed">{t("tabs.feed")}</TabsTrigger>
            <TabsTrigger value="members">{t("tabs.members")}</TabsTrigger>
          </TabsList>

          <TabsContent value="feed" className="mt-4">
            <GroupFeedTab
              groupId={group.id}
              viewerId={viewerId}
              viewerRole={null}
              viewerDisplayName={viewerDisplayName}
              viewerPhotoUrl={viewerPhotoUrl}
              canPost={false}
            />
          </TabsContent>

          <TabsContent value="members" className="mt-4">
            <GroupMembersTab groupId={group.id} viewerRole={null} viewerId={viewerId} />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs id="group-detail-tabs" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="feed">{t("tabs.feed")}</TabsTrigger>
          <TabsTrigger value="channels">{t("tabs.channels")}</TabsTrigger>
          <TabsTrigger value="members">{t("tabs.members")}</TabsTrigger>
          <TabsTrigger value="files">{t("tabs.files")}</TabsTrigger>
        </TabsList>

        <TabsContent value="feed" className="mt-4">
          <GroupFeedTab
            groupId={group.id}
            viewerId={viewerId}
            viewerRole={viewerRole}
            viewerDisplayName={viewerDisplayName}
            viewerPhotoUrl={viewerPhotoUrl}
            canPost={canPost}
          />
        </TabsContent>

        <TabsContent value="channels" className="mt-4">
          {isActiveMember ? (
            <GroupChannelsTab groupId={group.id} viewerRole={viewerRole} />
          ) : (
            <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              {t("requiresMembership")}
            </div>
          )}
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <GroupMembersTab groupId={group.id} viewerRole={viewerRole} viewerId={viewerId} />
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          {isActiveMember ? (
            <GroupFilesTab groupId={group.id} />
          ) : (
            <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              {t("requiresMembershipFiles")}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
