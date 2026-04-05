import "server-only";
import { pgTable, uuid, timestamp, pgEnum } from "drizzle-orm/pg-core";
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
