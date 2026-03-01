import { pgTable, uuid, timestamp, index, primaryKey } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const communityMemberFollows = pgTable(
  "community_member_follows",
  {
    followerId: uuid("follower_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    followingId: uuid("following_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followingId] }),
    index("idx_community_member_follows_following_id").on(t.followingId),
    index("idx_community_member_follows_follower_id").on(t.followerId),
  ],
);

export type CommunityMemberFollow = typeof communityMemberFollows.$inferSelect;
export type NewCommunityMemberFollow = typeof communityMemberFollows.$inferInsert;
