import "server-only";
import { pgTable, uuid, jsonb, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";
import { portalCompanyProfiles } from "./portal-company-profiles";

export const portalVerificationStatusEnum = pgEnum("portal_verification_status", [
  "pending",
  "approved",
  "rejected",
]);

/** A single document reference stored inside the submitted_documents JSONB array. */
export interface VerificationDocument {
  fileUploadId: string;
  objectKey: string;
  originalFilename: string;
}

export const portalEmployerVerifications = pgTable("portal_employer_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => portalCompanyProfiles.id, { onDelete: "cascade" }),
  submittedDocuments: jsonb("submitted_documents")
    .$type<VerificationDocument[]>()
    .notNull()
    .default([]),
  status: portalVerificationStatusEnum("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedByAdminId: uuid("reviewed_by_admin_id").references(() => authUsers.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PortalEmployerVerification = typeof portalEmployerVerifications.$inferSelect;
export type NewPortalEmployerVerification = typeof portalEmployerVerifications.$inferInsert;
export type PortalVerificationStatus = "pending" | "approved" | "rejected";
