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

export type ScreeningFlag = {
  rule_id: string;
  message: string;
  severity: "low" | "medium" | "high";
  field?: string;
  match?: string;
};

export type ScreeningResult = {
  status: "pass" | "warning" | "fail";
  flags: ScreeningFlag[];
  checked_at: string;
  rule_version: number;
};

export const portalScreeningStatusEnum = pgEnum("portal_screening_status", [
  "pass",
  "warning",
  "fail",
]);

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
  screeningStatus: portalScreeningStatusEnum("screening_status"),
  screeningResultJson: jsonb("screening_result_json").$type<ScreeningResult | null>(),
  screeningCheckedAt: timestamp("screening_checked_at", { withTimezone: true }),
  // Added in P-2.5A migration 0063 — employer opts in to require cover letter
  enableCoverLetter: boolean("enable_cover_letter").notNull().default(false),
  // Added in P-4.2 migration 0071 — marks a posting as featured/promoted on the discovery page.
  isFeatured: boolean("is_featured").notNull().default(false),
  // Added in PREP-F migration 0069 — trigger-maintained tsvector for full-text search.
  // Do NOT include in INSERT/UPDATE payloads — the PL/pgSQL trigger populates these.
  // The text() type is a deliberate lie for Drizzle's benefit; actual DB type is tsvector.
  searchVector: text("search_vector"),
  searchVectorIgbo: text("search_vector_igbo"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PortalJobPosting = typeof portalJobPostings.$inferSelect;
export type NewPortalJobPosting = typeof portalJobPostings.$inferInsert;
export type PortalEmploymentType = (typeof portalEmploymentTypeEnum.enumValues)[number];
export type PortalJobStatus = (typeof portalJobStatusEnum.enumValues)[number];
export type PortalClosedOutcome = (typeof portalClosedOutcomeEnum.enumValues)[number];
export type PortalScreeningStatus = (typeof portalScreeningStatusEnum.enumValues)[number];

// State Interaction Matrix (see docs/decisions/state-interaction-matrix.md)
// Names frozen in docs/decisions/state-interaction-matrix.md §1 Terminology.
// Hard terminal: no outgoing transitions, cannot be touched by any event.
// Soft terminal: renewable via owner-initiated events only (P-1.5 renew flow).
// TD-1: `rejected` is NOT terminal — it loops back to `pending_review` via
//        edit+resubmit per the VALID_TRANSITIONS table in
//        apps/portal/src/services/job-posting-service.ts.
export const JOB_HARD_TERMINAL_STATES = ["filled"] as const satisfies readonly PortalJobStatus[];
export const JOB_SOFT_TERMINAL_STATES = ["expired"] as const satisfies readonly PortalJobStatus[];

export function isHardTerminalJobStatus(
  status: PortalJobStatus,
): status is (typeof JOB_HARD_TERMINAL_STATES)[number] {
  return (JOB_HARD_TERMINAL_STATES as readonly PortalJobStatus[]).includes(status);
}

export function isSoftTerminalJobStatus(
  status: PortalJobStatus,
): status is (typeof JOB_SOFT_TERMINAL_STATES)[number] {
  return (JOB_SOFT_TERMINAL_STATES as readonly PortalJobStatus[]).includes(status);
}
