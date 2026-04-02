import { pgTable, uuid, timestamp, index, primaryKey } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";
import { communityGroups } from "./community-groups";

export const platformDismissedGroupRecommendations = pgTable(
  "platform_dismissed_group_recommendations",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => communityGroups.id, { onDelete: "cascade" }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.groupId] }),
    index("dismissed_recs_user_idx").on(t.userId),
  ],
);

export type PlatformDismissedGroupRecommendation =
  typeof platformDismissedGroupRecommendations.$inferSelect;
