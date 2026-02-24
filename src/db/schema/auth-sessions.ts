import { pgTable, uuid, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionToken: varchar("session_token", { length: 255 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
    deviceName: varchar("device_name", { length: 255 }),
    deviceIp: varchar("device_ip", { length: 45 }),
    deviceLocation: varchar("device_location", { length: 255 }),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_auth_sessions_user_id").on(t.userId),
    index("idx_auth_sessions_expires").on(t.expires),
    uniqueIndex("unq_auth_sessions_session_token").on(t.sessionToken),
  ],
);

export type AuthSession = typeof authSessions.$inferSelect;
export type NewAuthSession = typeof authSessions.$inferInsert;
