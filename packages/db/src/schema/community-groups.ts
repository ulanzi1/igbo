import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const communityGroupVisibilityEnum = pgEnum("community_group_visibility", [
  "public",
  "private",
  "hidden",
]);

export const communityGroupJoinTypeEnum = pgEnum("community_group_join_type", ["open", "approval"]);

export const communityGroupPostingPermissionEnum = pgEnum("community_group_posting_permission", [
  "all_members",
  "leaders_only",
  "moderated",
]);

export const communityGroupCommentingPermissionEnum = pgEnum(
  "community_group_commenting_permission",
  ["open", "members_only", "disabled"],
);

export const communityGroupMemberRoleEnum = pgEnum("community_group_member_role", [
  "member",
  "leader",
  "creator",
]);

export const communityGroupMemberStatusEnum = pgEnum("community_group_member_status", [
  "active",
  "pending",
  "banned",
]);

// ─── Tables ───────────────────────────────────────────────────────────────────

export const communityGroups = pgTable(
  "community_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    bannerUrl: text("banner_url"),
    visibility: communityGroupVisibilityEnum("visibility").notNull().default("public"),
    joinType: communityGroupJoinTypeEnum("join_type").notNull().default("open"),
    postingPermission: communityGroupPostingPermissionEnum("posting_permission")
      .notNull()
      .default("all_members"),
    commentingPermission: communityGroupCommentingPermissionEnum("commenting_permission")
      .notNull()
      .default("open"),
    memberLimit: integer("member_limit"),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    memberCount: integer("member_count").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_community_groups_creator_id").on(t.creatorId),
    index("idx_community_groups_visibility")
      .on(t.visibility)
      .where(sql`deleted_at IS NULL`),
  ],
);

export const communityGroupMembers = pgTable(
  "community_group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => communityGroups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: communityGroupMemberRoleEnum("role").notNull().default("member"),
    status: communityGroupMemberStatusEnum("status").notNull().default("active"),
    mutedUntil: timestamp("muted_until", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    index("idx_community_group_members_user_id").on(t.userId),
    index("idx_community_group_members_group_id").on(t.groupId),
  ],
);

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type CommunityGroup = typeof communityGroups.$inferSelect;
export type NewCommunityGroup = typeof communityGroups.$inferInsert;
export type CommunityGroupMember = typeof communityGroupMembers.$inferSelect;
export type NewCommunityGroupMember = typeof communityGroupMembers.$inferInsert;

export type GroupVisibility = "public" | "private" | "hidden";
export type GroupJoinType = "open" | "approval";
export type GroupPostingPermission = "all_members" | "leaders_only" | "moderated";
export type GroupCommentingPermission = "open" | "members_only" | "disabled";
export type GroupMemberRole = "member" | "leader" | "creator";
export type GroupMemberStatus = "active" | "pending" | "banned";
