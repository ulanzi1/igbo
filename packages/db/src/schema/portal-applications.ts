import "server-only";
import { pgTable, uuid, timestamp, pgEnum, text } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";
import { portalJobPostings } from "./portal-job-postings";

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

export const portalActorRoleEnum = pgEnum("portal_actor_role", [
  "job_seeker",
  "employer",
  "job_admin",
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
  previousStatus: portalApplicationStatusEnum("previous_status"),
  transitionedAt: timestamp("transitioned_at", { withTimezone: true }),
  transitionedByUserId: uuid("transitioned_by_user_id").references(() => authUsers.id, {
    onDelete: "set null",
  }),
  transitionReason: text("transition_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const portalApplicationTransitions = pgTable("portal_application_transitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => portalApplications.id, { onDelete: "cascade" }),
  fromStatus: portalApplicationStatusEnum("from_status").notNull(),
  toStatus: portalApplicationStatusEnum("to_status").notNull(),
  actorUserId: uuid("actor_user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "restrict" }),
  actorRole: portalActorRoleEnum("actor_role").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PortalApplication = typeof portalApplications.$inferSelect;
export type NewPortalApplication = typeof portalApplications.$inferInsert;
export type PortalApplicationStatus = (typeof portalApplicationStatusEnum.enumValues)[number];
export type PortalActorRole = (typeof portalActorRoleEnum.enumValues)[number];
export type PortalApplicationTransition = typeof portalApplicationTransitions.$inferSelect;
export type NewPortalApplicationTransition = typeof portalApplicationTransitions.$inferInsert;
