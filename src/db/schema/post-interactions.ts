import { pgTable, pgEnum, uuid, text, timestamp, index, primaryKey } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";
import { communityPosts } from "./community-posts";

export const postReactionTypeEnum = pgEnum("community_post_reaction_type", [
  "like",
  "love",
  "celebrate",
  "insightful",
  "funny",
]);

export const communityPostReactions = pgTable(
  "community_post_reactions",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    reactionType: postReactionTypeEnum("reaction_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId] }),
    index("idx_community_post_reactions_post_id").on(t.postId),
  ],
);

export const communityPostComments = pgTable(
  "community_post_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    // Self-referential FK — enforced by migration SQL, not by Drizzle .references().
    // Using plain uuid() avoids circular reference issues in Drizzle schema loading.
    parentCommentId: uuid("parent_comment_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_community_post_comments_post_id").on(t.postId),
    index("idx_community_post_comments_parent_id").on(t.parentCommentId),
  ],
);

export type PostReactionType = "like" | "love" | "celebrate" | "insightful" | "funny";
export type CommunityPostReaction = typeof communityPostReactions.$inferSelect;
export type CommunityPostComment = typeof communityPostComments.$inferSelect;
export type NewCommunityPostComment = typeof communityPostComments.$inferInsert;
