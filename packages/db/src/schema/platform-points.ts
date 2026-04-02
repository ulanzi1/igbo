import {
  pgTable,
  uuid,
  integer,
  text,
  boolean,
  numeric,
  varchar,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const platformPointsSourceTypeEnum = pgEnum("platform_points_source_type", [
  "like_received",
  "event_attended",
  "article_published",
]);

export const platformPointsLedger = pgTable("platform_points_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  points: integer("points").notNull(),
  reason: varchar("reason", { length: 100 }).notNull(),
  sourceType: platformPointsSourceTypeEnum("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  multiplierApplied: numeric("multiplier_applied", { precision: 4, scale: 2 })
    .notNull()
    .default("1.00"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const platformPointsRules = pgTable("platform_points_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  activityType: varchar("activity_type", { length: 50 }).notNull().unique(),
  basePoints: integer("base_points").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PlatformPointsLedgerEntry = typeof platformPointsLedger.$inferSelect;
export type NewPlatformPointsLedgerEntry = typeof platformPointsLedger.$inferInsert;
export type PlatformPointsRule = typeof platformPointsRules.$inferSelect;
