import "server-only";
import { pgTable, primaryKey, uuid, varchar, jsonb, integer, timestamp } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";
import { portalApplications } from "./portal-applications";

export const portalOutbox = pgTable("portal_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  payload: jsonb("payload").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

export type PortalOutboxEvent = typeof portalOutbox.$inferSelect;
export type NewPortalOutboxEvent = typeof portalOutbox.$inferInsert;

export const portalApplicationViews = pgTable(
  "portal_application_views",
  {
    applicationId: uuid("application_id")
      .notNull()
      .references(() => portalApplications.id, { onDelete: "cascade" }),
    employerUserId: uuid("employer_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.applicationId, table.employerUserId] })],
);

export type PortalApplicationView = typeof portalApplicationViews.$inferSelect;
