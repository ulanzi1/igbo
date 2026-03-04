import { pgTable, uuid, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";
import { communityGroups } from "./community-groups";

export const communityGroupModerationLogs = pgTable(
  "community_group_moderation_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => communityGroups.id, { onDelete: "cascade" }),
    moderatorId: uuid("moderator_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    targetUserId: uuid("target_user_id").references(() => authUsers.id, { onDelete: "cascade" }),
    targetType: varchar("target_type").notNull(), // 'post' | 'comment' | 'member'
    targetId: uuid("target_id"), // postId, commentId, or null
    action: varchar("action").notNull(), // 'mute' | 'unmute' | 'ban' | 'unban' | 'remove_post' | 'remove_comment' | 'promote_leader' | 'demote_leader'
    reason: text("reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_group_moderation_logs_group_id").on(t.groupId),
    index("idx_group_moderation_logs_moderator_id").on(t.moderatorId),
    index("idx_group_moderation_logs_target_user_id").on(t.targetUserId),
  ],
);

export type CommunityGroupModerationLog = typeof communityGroupModerationLogs.$inferSelect;
export type NewCommunityGroupModerationLog = typeof communityGroupModerationLogs.$inferInsert;

export type GroupModerationAction =
  | "mute"
  | "unmute"
  | "ban"
  | "unban"
  | "remove_post"
  | "remove_comment"
  | "promote_leader"
  | "demote_leader";

export type GroupModerationTargetType = "post" | "comment" | "member";
