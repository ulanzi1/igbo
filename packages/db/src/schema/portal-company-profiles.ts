import "server-only";
import { pgTable, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const portalCompanyProfiles = pgTable("portal_company_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  logoUrl: text("logo_url"),
  description: text("description"),
  industry: varchar("industry", { length: 100 }),
  companySize: varchar("company_size", { length: 50 }),
  cultureInfo: text("culture_info"),
  trustBadge: boolean("trust_badge").notNull().default(false),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PortalCompanyProfile = typeof portalCompanyProfiles.$inferSelect;
export type NewPortalCompanyProfile = typeof portalCompanyProfiles.$inferInsert;
