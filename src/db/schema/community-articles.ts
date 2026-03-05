import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

import { authUsers } from "./auth-users";

export const articleLanguageEnum = pgEnum("community_article_language", ["en", "ig", "both"]);

export const articleVisibilityEnum = pgEnum("community_article_visibility", [
  "guest",
  "members_only",
]);

export const articleStatusEnum = pgEnum("community_article_status", [
  "draft",
  "pending_review",
  "published",
  "rejected",
]);

export const articleCategoryEnum = pgEnum("community_article_category", [
  "discussion",
  "announcement",
  "event",
]);

export const communityArticles = pgTable(
  "community_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    titleIgbo: varchar("title_igbo", { length: 255 }),
    slug: varchar("slug", { length: 300 }).notNull().unique(),
    content: text("content").notNull(),
    contentIgbo: text("content_igbo"),
    coverImageUrl: text("cover_image_url"),
    language: articleLanguageEnum("language").notNull().default("en"),
    visibility: articleVisibilityEnum("visibility").notNull().default("members_only"),
    status: articleStatusEnum("status").notNull().default("draft"),
    category: articleCategoryEnum("category").notNull().default("discussion"),
    isFeatured: boolean("is_featured").notNull().default(false),
    readingTimeMinutes: integer("reading_time_minutes").notNull().default(1),
    viewCount: integer("view_count").notNull().default(0),
    likeCount: integer("like_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    rejectionFeedback: text("rejection_feedback"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_community_articles_author_id").on(t.authorId),
    index("idx_community_articles_status_created").on(t.status, t.createdAt.desc()),
    index("idx_community_articles_slug").on(t.slug),
  ],
);

export const communityArticleTags = pgTable(
  "community_article_tags",
  {
    articleId: uuid("article_id")
      .notNull()
      .references(() => communityArticles.id, { onDelete: "cascade" }),
    tag: varchar("tag", { length: 50 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.articleId, t.tag] }),
    index("idx_community_article_tags_tag").on(t.tag),
  ],
);

export type CommunityArticle = typeof communityArticles.$inferSelect;
export type NewCommunityArticle = typeof communityArticles.$inferInsert;
export type CommunityArticleTag = typeof communityArticleTags.$inferSelect;
export type ArticleLanguage = "en" | "ig" | "both";
export type ArticleVisibility = "guest" | "members_only";
export type ArticleStatus = "draft" | "pending_review" | "published" | "rejected";
export type ArticleCategory = "discussion" | "announcement" | "event";
