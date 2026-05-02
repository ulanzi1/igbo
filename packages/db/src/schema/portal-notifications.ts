import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { authUsers } from "./auth-users";

export const portalNotifications = pgTable(
  "portal_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    link: text("link"),
    payloadJson: jsonb("payload_json"),
    readAt: timestamp("read_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_portal_notifications_user_read_created").on(t.userId, t.readAt, t.createdAt.desc()),
    index("idx_portal_notifications_user_dismissed").on(t.userId, t.dismissedAt),
    uniqueIndex("idx_portal_notifications_idempotency_key")
      .on(t.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
  ],
);

export type PortalNotification = typeof portalNotifications.$inferSelect;
export type NewPortalNotification = typeof portalNotifications.$inferInsert;
