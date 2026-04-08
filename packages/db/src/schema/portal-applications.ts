import "server-only";
import { pgTable, uuid, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";
import { portalJobPostings, type PortalJobStatus } from "./portal-job-postings";

export const portalApplicationStatusEnum = pgEnum("portal_application_status", [
  "submitted",
  "under_review",
  "shortlisted",
  "interview",
  "offered",
  "hired",
  "rejected",
  "withdrawn",
]);

export const portalApplications = pgTable("portal_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => portalJobPostings.id, { onDelete: "cascade" }),
  seekerUserId: uuid("seeker_user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  status: portalApplicationStatusEnum("status").notNull().default("submitted"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PortalApplication = typeof portalApplications.$inferSelect;
export type NewPortalApplication = typeof portalApplications.$inferInsert;
export type PortalApplicationStatus = (typeof portalApplicationStatusEnum.enumValues)[number];

// State Interaction Matrix (see docs/decisions/state-interaction-matrix.md)
// Names frozen in docs/decisions/state-interaction-matrix.md §1 Terminology.
// All three are hard terminals — no external event may touch them.
// `offered` is intentionally NON-terminal (offered → hired | rejected).
export const APPLICATION_TERMINAL_STATES = [
  "hired",
  "rejected",
  "withdrawn",
] as const satisfies readonly PortalApplicationStatus[];

export function isTerminalApplicationStatus(
  status: PortalApplicationStatus,
): status is (typeof APPLICATION_TERMINAL_STATES)[number] {
  return (APPLICATION_TERMINAL_STATES as readonly PortalApplicationStatus[]).includes(status);
}

/**
 * Application-creation precondition (State Interaction Matrix §6).
 * New applications are accepted ONLY when the parent job is `active`.
 * `paused`, `pending_review`, `draft`, and any terminal status reject creation.
 */
export function canAcceptApplications(jobStatus: PortalJobStatus): boolean {
  return jobStatus === "active";
}
