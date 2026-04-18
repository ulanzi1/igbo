import "server-only";
import { pgTable, pgEnum, uuid, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { authUsers } from "./auth-users";

export const portalAlertFrequencyEnum = pgEnum("portal_alert_frequency", [
  "instant",
  "daily",
  "off",
]);

export type PortalAlertFrequency = (typeof portalAlertFrequencyEnum.enumValues)[number];

export const portalSavedSearches = pgTable(
  "portal_saved_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    searchParamsJson: jsonb("search_params_json").notNull(),
    alertFrequency: portalAlertFrequencyEnum("alert_frequency").notNull().default("daily"),
    lastAlertedAt: timestamp("last_alerted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_saved_searches_user_id").on(table.userId),
    index("idx_saved_searches_alert_frequency")
      .on(table.alertFrequency)
      .where(sql`alert_frequency != 'off'`),
  ],
);

export type PortalSavedSearch = typeof portalSavedSearches.$inferSelect;
export type NewPortalSavedSearch = typeof portalSavedSearches.$inferInsert;
