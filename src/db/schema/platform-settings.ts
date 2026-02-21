import { pgTable, text, jsonb, timestamp, uuid } from "drizzle-orm/pg-core";

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  // TODO: Add .references(() => authUsers.id) once auth_users schema is added in Story 1.2
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
