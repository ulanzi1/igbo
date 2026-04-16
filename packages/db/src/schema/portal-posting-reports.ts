import "server-only";
import { pgTable, uuid, varchar, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";
import { portalJobPostings } from "./portal-job-postings";

export const portalReportCategoryEnum = pgEnum("portal_report_category", [
  "scam_fraud",
  "misleading_info",
  "discriminatory_content",
  "duplicate_posting",
  "other",
]);

export const portalReportStatusEnum = pgEnum("portal_report_status", [
  "open",
  "investigating",
  "resolved",
  "dismissed",
]);

// Priority is computed, not stored — only exported as a TS type
export const portalReportPriorityEnum = pgEnum("portal_report_priority", [
  "normal",
  "elevated",
  "urgent",
]);

export const portalPostingReports = pgTable("portal_posting_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  postingId: uuid("posting_id")
    .notNull()
    .references(() => portalJobPostings.id, { onDelete: "cascade" }),
  reporterUserId: uuid("reporter_user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  category: portalReportCategoryEnum("category").notNull(),
  description: text("description").notNull(),
  status: portalReportStatusEnum("status").notNull().default("open"),
  resolutionAction: varchar("resolution_action", { length: 30 }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedByUserId: uuid("resolved_by_user_id").references(() => authUsers.id, {
    onDelete: "set null",
  }),
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PortalPostingReport = typeof portalPostingReports.$inferSelect;
export type NewPortalPostingReport = typeof portalPostingReports.$inferInsert;
export type PortalReportCategory =
  | "scam_fraud"
  | "misleading_info"
  | "discriminatory_content"
  | "duplicate_posting"
  | "other";
export type PortalReportStatus = "open" | "investigating" | "resolved" | "dismissed";
export type PortalReportPriority = "normal" | "elevated" | "urgent";
