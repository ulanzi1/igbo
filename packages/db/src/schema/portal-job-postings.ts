import "server-only";
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { portalCompanyProfiles } from "./portal-company-profiles";

export const portalEmploymentTypeEnum = pgEnum("portal_employment_type", [
  "full_time",
  "part_time",
  "contract",
  "internship",
  "apprenticeship",
]);

export const portalJobStatusEnum = pgEnum("portal_job_status", [
  "draft",
  "pending_review",
  "active",
  "paused",
  "filled",
  "expired",
  "rejected",
]);

export const portalClosedOutcomeEnum = pgEnum("portal_closed_outcome", [
  "filled_via_portal",
  "filled_internally",
  "cancelled",
]);

export const portalJobPostings = pgTable("portal_job_postings", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => portalCompanyProfiles.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  descriptionHtml: text("description_html"),
  requirements: text("requirements"),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  salaryCompetitiveOnly: boolean("salary_competitive_only").notNull().default(false),
  location: varchar("location", { length: 200 }),
  employmentType: portalEmploymentTypeEnum("employment_type").notNull(),
  status: portalJobStatusEnum("status").notNull().default("draft"),
  culturalContextJson: jsonb("cultural_context_json").$type<Record<string, boolean> | null>(),
  descriptionIgboHtml: text("description_igbo_html"),
  applicationDeadline: timestamp("application_deadline", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  adminFeedbackComment: text("admin_feedback_comment"),
  closedOutcome: portalClosedOutcomeEnum("closed_outcome"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  revisionCount: integer("revision_count").notNull().default(0),
  viewCount: integer("view_count").notNull().default(0),
  communityPostId: uuid("community_post_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PortalJobPosting = typeof portalJobPostings.$inferSelect;
export type NewPortalJobPosting = typeof portalJobPostings.$inferInsert;
export type PortalEmploymentType = (typeof portalEmploymentTypeEnum.enumValues)[number];
export type PortalJobStatus = (typeof portalJobStatusEnum.enumValues)[number];
export type PortalClosedOutcome = (typeof portalClosedOutcomeEnum.enumValues)[number];
