import "server-only";
import { pgTable, uuid, text, integer, varchar, uniqueIndex, timestamp } from "drizzle-orm/pg-core";
import { portalSeekerProfiles } from "./portal-seeker-profiles";

export const portalSeekerPreferences = pgTable(
  "portal_seeker_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seekerProfileId: uuid("seeker_profile_id")
      .notNull()
      .references(() => portalSeekerProfiles.id, { onDelete: "cascade" }),
    desiredRoles: text("desired_roles").array().notNull().default([]),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: varchar("salary_currency", { length: 3 }).notNull().default("NGN"),
    locations: text("locations").array().notNull().default([]),
    workModes: text("work_modes").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("portal_seeker_preferences_seeker_profile_id_unique").on(table.seekerProfileId),
  ],
);

export type PortalSeekerPreferences = typeof portalSeekerPreferences.$inferSelect;
export type NewPortalSeekerPreferences = typeof portalSeekerPreferences.$inferInsert;
