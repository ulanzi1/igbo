import "server-only";
import { pgTable, uuid, varchar, text, jsonb, uniqueIndex, timestamp } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const portalSeekerProfiles = pgTable(
  "portal_seeker_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    headline: varchar("headline", { length: 200 }).notNull(),
    summary: text("summary"),
    skills: text("skills").array().notNull().default([]),
    experienceJson: jsonb("experience_json").notNull().default([]),
    educationJson: jsonb("education_json").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("portal_seeker_profiles_user_id_unique").on(table.userId)],
);

export type PortalSeekerProfile = typeof portalSeekerProfiles.$inferSelect;
export type NewPortalSeekerProfile = typeof portalSeekerProfiles.$inferInsert;

export interface SeekerExperience {
  title: string;
  company: string;
  startDate: string; // YYYY-MM
  endDate: string; // YYYY-MM or "Present"
  description?: string;
}

export interface SeekerEducation {
  institution: string;
  degree: string;
  field: string;
  graduationYear: number;
}
