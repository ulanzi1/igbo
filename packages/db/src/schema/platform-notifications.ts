import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const notificationTypeEnum = pgEnum("notification_type", [
  "message",
  "mention",
  "group_activity",
  "event_reminder",
  "post_interaction",
  "admin_announcement",
  "system",
]);

export const platformNotifications = pgTable(
  "platform_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    link: text("link"),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_platform_notifications_user_id_created_at").on(t.userId, t.createdAt.desc()),
    index("idx_platform_notifications_user_id_is_read").on(t.userId, t.isRead),
  ],
);

export type PlatformNotification = typeof platformNotifications.$inferSelect;
export type NewPlatformNotification = typeof platformNotifications.$inferInsert;
export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];
