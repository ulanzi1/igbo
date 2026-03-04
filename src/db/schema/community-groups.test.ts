// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  communityGroups,
  communityGroupMembers,
  communityGroupVisibilityEnum,
  communityGroupJoinTypeEnum,
  communityGroupPostingPermissionEnum,
  communityGroupCommentingPermissionEnum,
  communityGroupMemberRoleEnum,
  communityGroupMemberStatusEnum,
} from "./community-groups";
import type {
  CommunityGroup,
  CommunityGroupMember,
  GroupVisibility,
  GroupJoinType,
  GroupPostingPermission,
  GroupCommentingPermission,
  GroupMemberRole,
  GroupMemberStatus,
} from "./community-groups";

describe("community-groups schema", () => {
  describe("communityGroups table", () => {
    it("has all required columns", () => {
      const cols = Object.keys(communityGroups);
      expect(cols).toContain("id");
      expect(cols).toContain("name");
      expect(cols).toContain("description");
      expect(cols).toContain("bannerUrl");
      expect(cols).toContain("visibility");
      expect(cols).toContain("joinType");
      expect(cols).toContain("postingPermission");
      expect(cols).toContain("commentingPermission");
      expect(cols).toContain("memberLimit");
      expect(cols).toContain("creatorId");
      expect(cols).toContain("memberCount");
      expect(cols).toContain("deletedAt");
      expect(cols).toContain("createdAt");
      expect(cols).toContain("updatedAt");
    });

    it("id column is primary key", () => {
      expect(communityGroups.id.primary).toBe(true);
    });

    it("id column has default (gen_random_uuid)", () => {
      expect(communityGroups.id.hasDefault).toBe(true);
    });

    it("name column is notNull", () => {
      expect(communityGroups.name.notNull).toBe(true);
    });

    it("memberCount column is notNull with default", () => {
      expect(communityGroups.memberCount.notNull).toBe(true);
      expect(communityGroups.memberCount.hasDefault).toBe(true);
    });

    it("visibility column has default", () => {
      expect(communityGroups.visibility.hasDefault).toBe(true);
    });

    it("deletedAt column is nullable", () => {
      expect(communityGroups.deletedAt.notNull).toBeFalsy();
    });

    it("creatorId column is notNull", () => {
      expect(communityGroups.creatorId.notNull).toBe(true);
    });
  });

  describe("communityGroupMembers table", () => {
    it("has all required columns", () => {
      const cols = Object.keys(communityGroupMembers);
      expect(cols).toContain("groupId");
      expect(cols).toContain("userId");
      expect(cols).toContain("role");
      expect(cols).toContain("status");
      expect(cols).toContain("joinedAt");
    });

    it("role column has default", () => {
      expect(communityGroupMembers.role.hasDefault).toBe(true);
    });

    it("status column has default", () => {
      expect(communityGroupMembers.status.hasDefault).toBe(true);
    });

    it("joinedAt column is notNull with default", () => {
      expect(communityGroupMembers.joinedAt.notNull).toBe(true);
      expect(communityGroupMembers.joinedAt.hasDefault).toBe(true);
    });
  });

  describe("enum values", () => {
    it("communityGroupVisibilityEnum has correct values", () => {
      expect(communityGroupVisibilityEnum.enumValues).toEqual(["public", "private", "hidden"]);
    });

    it("communityGroupJoinTypeEnum has correct values", () => {
      expect(communityGroupJoinTypeEnum.enumValues).toEqual(["open", "approval"]);
    });

    it("communityGroupPostingPermissionEnum has correct values", () => {
      expect(communityGroupPostingPermissionEnum.enumValues).toEqual([
        "all_members",
        "leaders_only",
        "moderated",
      ]);
    });

    it("communityGroupCommentingPermissionEnum has correct values", () => {
      expect(communityGroupCommentingPermissionEnum.enumValues).toEqual([
        "open",
        "members_only",
        "disabled",
      ]);
    });

    it("communityGroupMemberRoleEnum has correct values", () => {
      expect(communityGroupMemberRoleEnum.enumValues).toEqual(["member", "leader", "creator"]);
    });

    it("communityGroupMemberStatusEnum has correct values", () => {
      expect(communityGroupMemberStatusEnum.enumValues).toEqual(["active", "pending", "banned"]);
    });
  });

  describe("inferred types", () => {
    it("CommunityGroup type has expected shape", () => {
      const _typeCheck: CommunityGroup = {
        id: "uuid",
        name: "Test Group",
        description: null,
        bannerUrl: null,
        visibility: "public",
        joinType: "open",
        postingPermission: "all_members",
        commentingPermission: "open",
        memberLimit: null,
        creatorId: "uuid",
        memberCount: 0,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(_typeCheck.name).toBe("Test Group");
    });

    it("CommunityGroupMember type has expected shape", () => {
      const _typeCheck: CommunityGroupMember = {
        groupId: "uuid",
        userId: "uuid",
        role: "creator",
        status: "active",
        joinedAt: new Date(),
      };
      expect(_typeCheck.role).toBe("creator");
    });

    it("GroupVisibility is a valid union type", () => {
      const vis: GroupVisibility = "public";
      expect(["public", "private", "hidden"]).toContain(vis);
    });

    it("GroupJoinType is a valid union type", () => {
      const jt: GroupJoinType = "open";
      expect(["open", "approval"]).toContain(jt);
    });

    it("GroupPostingPermission is a valid union type", () => {
      const pp: GroupPostingPermission = "all_members";
      expect(["all_members", "leaders_only", "moderated"]).toContain(pp);
    });

    it("GroupCommentingPermission is a valid union type", () => {
      const cp: GroupCommentingPermission = "open";
      expect(["open", "members_only", "disabled"]).toContain(cp);
    });

    it("GroupMemberRole is a valid union type", () => {
      const role: GroupMemberRole = "creator";
      expect(["member", "leader", "creator"]).toContain(role);
    });

    it("GroupMemberStatus is a valid union type", () => {
      const status: GroupMemberStatus = "active";
      expect(["active", "pending", "banned"]).toContain(status);
    });
  });
});
