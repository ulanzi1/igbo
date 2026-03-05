import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";
import { communityArticles } from "./community-articles";

export const communityArticleComments = pgTable(
  "community_article_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => communityArticles.id, { onDelete: "cascade" }),
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
  (t) => [index("idx_community_article_comments_article_id_created").on(t.articleId, t.createdAt)],
);

export type CommunityArticleComment = typeof communityArticleComments.$inferSelect;
export type NewCommunityArticleComment = typeof communityArticleComments.$inferInsert;
