import { pgTable, uuid, timestamp, index, primaryKey } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";
import { communityPosts } from "./community-posts";

export const communityPostBookmarks = pgTable(
  "community_post_bookmarks",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.postId] }),
    index("idx_community_post_bookmarks_user_id").on(t.userId),
    index("idx_community_post_bookmarks_post_id").on(t.postId),
  ],
);

export type CommunityPostBookmark = typeof communityPostBookmarks.$inferSelect;
export type NewCommunityPostBookmark = typeof communityPostBookmarks.$inferInsert;
