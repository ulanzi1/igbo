import "server-only";
import { pgTable, uuid, varchar, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { authUsers } from "./auth-users";

export const portalScreeningKeywords = pgTable(
  "portal_screening_keywords",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phrase: varchar("phrase", { length: 200 }).notNull(),
    category: varchar("category", { length: 40 }).notNull(),
    severity: varchar("severity", { length: 10 }).notNull().default("high"),
    notes: text("notes"),
    createdByAdminId: uuid("created_by_admin_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("portal_screening_keywords_phrase_unique")
      .on(sql`lower(${table.phrase})`)
      .where(sql`${table.deletedAt} IS NULL`),
    index("portal_screening_keywords_active_idx")
      .on(table.createdAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export type PortalScreeningKeyword = typeof portalScreeningKeywords.$inferSelect;
export type NewPortalScreeningKeyword = typeof portalScreeningKeywords.$inferInsert;
export type ScreeningKeywordCategory = "discriminatory" | "illegal" | "scam" | "other";
