import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { authUsers } from "./auth-users";

export const postContentTypeEnum = pgEnum("community_post_content_type", [
  "text",
  "rich_text",
  "media",
  "announcement",
]);

export const postVisibilityEnum = pgEnum("community_post_visibility", [
  "public",
  "group",
  "members_only",
]);

export const postCategoryEnum = pgEnum("community_post_category", [
  "discussion",
  "event",
  "announcement",
]);

export const communityPosts = pgTable(
  "community_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    contentType: postContentTypeEnum("content_type").notNull().default("text"),
    visibility: postVisibilityEnum("visibility").notNull().default("members_only"),
    category: postCategoryEnum("category").notNull().default("discussion"),
    groupId: uuid("group_id"), // FK to community_groups added in Story 5.1
    isPinned: boolean("is_pinned").notNull().default(false),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }), // Set when admin pins; null = not pinned
    likeCount: integer("like_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    shareCount: integer("share_count").notNull().default(0),
    originalPostId: uuid("original_post_id"), // FK to self: enforced in migration, lazy ref to avoid circular
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_community_posts_author_id").on(t.authorId),
    index("idx_community_posts_created_at").on(t.createdAt.desc()),
    index("idx_community_posts_is_pinned")
      .on(t.isPinned)
      .where(sql`is_pinned = true`),
  ],
);

export const communityPostMedia = pgTable(
  "community_post_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    mediaUrl: text("media_url").notNull(),
    mediaType: varchar("media_type", { length: 20 }).notNull(), // 'image' | 'video'
    altText: text("alt_text"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_community_post_media_post_id").on(t.postId)],
);

export type CommunityPost = typeof communityPosts.$inferSelect;
export type NewCommunityPost = typeof communityPosts.$inferInsert;
export type CommunityPostMedia = typeof communityPostMedia.$inferSelect;
export type NewCommunityPostMedia = typeof communityPostMedia.$inferInsert;
export type PostCategory = "discussion" | "event" | "announcement";
