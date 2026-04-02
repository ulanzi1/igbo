import { pgTable, uuid, pgEnum, timestamp } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const badgeTypeEnum = pgEnum("badge_type_enum", ["blue", "red", "purple"]);

export const communityUserBadges = pgTable("community_user_badges", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  badgeType: badgeTypeEnum("badge_type").notNull(),
  assignedBy: uuid("assigned_by")
    .notNull()
    .references(() => authUsers.id),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
});

export type BadgeType = "blue" | "red" | "purple";
export type CommunityUserBadge = typeof communityUserBadges.$inferSelect;
