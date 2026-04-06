import "server-only";
import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";
import { portalJobPostings } from "./portal-job-postings";

export const portalAdminReviews = pgTable("portal_admin_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  postingId: uuid("posting_id")
    .notNull()
    .references(() => portalJobPostings.id, { onDelete: "cascade" }),
  reviewerUserId: uuid("reviewer_user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  decision: varchar("decision", { length: 20 }).notNull(),
  feedbackComment: text("feedback_comment"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PortalAdminReview = typeof portalAdminReviews.$inferSelect;
export type NewPortalAdminReview = typeof portalAdminReviews.$inferInsert;
export type AdminReviewDecision = "approved" | "rejected" | "changes_requested";
