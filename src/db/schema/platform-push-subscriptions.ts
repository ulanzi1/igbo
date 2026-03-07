import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const platformPushSubscriptions = pgTable(
  "platform_push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    keysP256dh: text("keys_p256dh").notNull(),
    keysAuth: text("keys_auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("push_subs_user_idx").on(t.userId)],
);

export type PlatformPushSubscription = typeof platformPushSubscriptions.$inferSelect;
export type NewPlatformPushSubscription = typeof platformPushSubscriptions.$inferInsert;
