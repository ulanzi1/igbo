import "server-only";
import { pgTable, uuid, varchar, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";
import { portalJobPostings } from "./portal-job-postings";

export const portalAdminFlagStatusEnum = pgEnum("portal_admin_flag_status", [
  "open",
  "resolved",
  "dismissed",
]);

export const portalViolationCategoryEnum = pgEnum("portal_violation_category", [
  "misleading_content",
  "discriminatory_language",
  "scam_fraud",
  "terms_of_service_violation",
  "other",
]);

export const portalAdminFlags = pgTable("portal_admin_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  postingId: uuid("posting_id")
    .notNull()
    .references(() => portalJobPostings.id, { onDelete: "cascade" }),
  adminUserId: uuid("admin_user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  category: portalViolationCategoryEnum("category").notNull(),
  severity: varchar("severity", { length: 10 }).notNull(),
  description: text("description").notNull(),
  status: portalAdminFlagStatusEnum("status").notNull().default("open"),
  autoPaused: boolean("auto_paused").notNull().default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedByUserId: uuid("resolved_by_user_id").references(() => authUsers.id, {
    onDelete: "set null",
  }),
  resolutionAction: varchar("resolution_action", { length: 20 }),
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PortalAdminFlag = typeof portalAdminFlags.$inferSelect;
export type NewPortalAdminFlag = typeof portalAdminFlags.$inferInsert;
export type PortalAdminFlagStatus = "open" | "resolved" | "dismissed";
export type PortalViolationCategory =
  | "misleading_content"
  | "discriminatory_language"
  | "scam_fraud"
  | "terms_of_service_violation"
  | "other";
