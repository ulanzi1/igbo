import { pgTable, uuid, text, timestamp, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

// Separate from moderationContentTypeEnum — includes comment, member, article which existing enum lacks
export const reportContentTypeEnum = pgEnum("report_content_type", [
  "post",
  "comment",
  "message",
  "member",
  "article",
]);

export const reportReasonCategoryEnum = pgEnum("report_reason_category", [
  "harassment",
  "spam",
  "inappropriate_content",
  "misinformation",
  "impersonation",
  "other",
]);

// Separate from moderationActionStatusEnum — includes 'resolved' which existing enum lacks
export const reportStatusEnum = pgEnum("report_status", [
  "pending",
  "reviewed",
  "resolved",
  "dismissed",
]);

export const platformReports = pgTable(
  "platform_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    contentType: reportContentTypeEnum("content_type").notNull(),
    // contentId is TEXT (not FK) because it references multiple tables depending on contentType
    contentId: text("content_id").notNull(),
    reasonCategory: reportReasonCategoryEnum("reason_category").notNull(),
    reasonText: text("reason_text"),
    status: reportStatusEnum("status").notNull().default("pending"),
    // Nullable: reviewer may be deleted
    reviewedBy: uuid("reviewed_by").references(() => authUsers.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Prevents same user from filing duplicate reports on the same content item
    uniqueIndex("idx_platform_reports_unique").on(t.reporterId, t.contentType, t.contentId),
  ],
);

export type PlatformReport = typeof platformReports.$inferSelect;
