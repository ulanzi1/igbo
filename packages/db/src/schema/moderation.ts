import { pgTable, uuid, text, boolean, timestamp, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const moderationKeywordCategoryEnum = pgEnum("moderation_keyword_category", [
  "hate_speech",
  "explicit",
  "spam",
  "harassment",
  "other",
]);

export const moderationKeywordSeverityEnum = pgEnum("moderation_keyword_severity", [
  "low",
  "medium",
  "high",
]);

export const moderationContentTypeEnum = pgEnum("moderation_content_type", [
  "post",
  "article",
  "message",
]);

export const moderationActionStatusEnum = pgEnum("moderation_action_status", [
  "pending",
  "reviewed",
  "dismissed",
]);

export const moderationVisibilityEnum = pgEnum("moderation_visibility_override", [
  "visible",
  "hidden",
]);

export const platformModerationKeywords = pgTable(
  "platform_moderation_keywords",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyword: text("keyword").notNull(),
    category: moderationKeywordCategoryEnum("category").notNull(),
    severity: moderationKeywordSeverityEnum("severity").notNull(),
    notes: text("notes"),
    // Nullable: if the admin user is deleted, keyword history is preserved with null creator
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("idx_moderation_keywords_keyword").on(t.keyword)],
);

export const platformModerationActions = pgTable(
  "platform_moderation_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentType: moderationContentTypeEnum("content_type").notNull(),
    contentId: text("content_id").notNull(),
    contentAuthorId: text("content_author_id").notNull(),
    contentPreview: text("content_preview"),
    flaggedAt: timestamp("flagged_at", { withTimezone: true }).defaultNow().notNull(),
    status: moderationActionStatusEnum("status").notNull().default("pending"),
    flagReason: text("flag_reason").notNull(),
    keywordMatched: text("keyword_matched"),
    autoFlagged: boolean("auto_flagged").notNull().default(true),
    moderatorId: uuid("moderator_id").references(() => authUsers.id, { onDelete: "set null" }),
    actionedAt: timestamp("actioned_at", { withTimezone: true }),
    visibilityOverride: moderationVisibilityEnum("visibility_override")
      .notNull()
      .default("visible"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("idx_moderation_actions_content").on(t.contentType, t.contentId)],
);

export type PlatformModerationKeyword = typeof platformModerationKeywords.$inferSelect;
export type PlatformModerationAction = typeof platformModerationActions.$inferSelect;
