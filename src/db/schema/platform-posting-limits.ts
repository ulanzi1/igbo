import { pgTable, uuid, varchar, integer } from "drizzle-orm/pg-core";

export const platformPostingLimits = pgTable("platform_posting_limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  tier: varchar("tier", { length: 20 }).notNull(),
  baseLimit: integer("base_limit").notNull(),
  pointsThreshold: integer("points_threshold").notNull(),
  bonusLimit: integer("bonus_limit").notNull(),
});

export type PlatformPostingLimit = typeof platformPostingLimits.$inferSelect;
