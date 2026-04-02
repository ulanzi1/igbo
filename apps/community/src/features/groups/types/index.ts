// Re-export schema-inferred types for use across the groups feature
export type {
  CommunityGroup,
  NewCommunityGroup,
  CommunityGroupMember,
  NewCommunityGroupMember,
  GroupVisibility,
  GroupJoinType,
  GroupPostingPermission,
  GroupCommentingPermission,
  GroupMemberRole,
  GroupMemberStatus,
} from "@igbo/db/schema/community-groups";

export type { GroupListItem, GroupDetail, DirectoryGroupItem } from "@igbo/db/queries/groups";
