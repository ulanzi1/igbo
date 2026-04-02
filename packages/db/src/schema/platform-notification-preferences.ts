import { boolean, pgTable, primaryKey, text, time, timestamp, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const platformNotificationPreferences = pgTable(
  "platform_notification_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    notificationType: text("notification_type").notNull(),
    channelInApp: boolean("channel_in_app").notNull().default(true),
    channelEmail: boolean("channel_email").notNull().default(false),
    channelPush: boolean("channel_push").notNull().default(false),
    digestMode: text("digest_mode").notNull().default("none"),
    quietHoursStart: time("quiet_hours_start"),
    quietHoursEnd: time("quiet_hours_end"),
    quietHoursTimezone: text("quiet_hours_timezone").notNull().default("UTC"),
    lastDigestAt: timestamp("last_digest_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.notificationType] }),
  }),
);
