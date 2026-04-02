import { pgTable, uuid, timestamp, index, primaryKey } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const platformBlockedUsers = pgTable(
  "platform_blocked_users",
  {
    blockerUserId: uuid("blocker_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    blockedUserId: uuid("blocked_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerUserId, t.blockedUserId] }),
    index("idx_platform_blocked_users_blocker_id").on(t.blockerUserId),
    index("idx_platform_blocked_users_blocked_id").on(t.blockedUserId),
  ],
);

export const platformMutedUsers = pgTable(
  "platform_muted_users",
  {
    muterUserId: uuid("muter_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    mutedUserId: uuid("muted_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.muterUserId, t.mutedUserId] }),
    index("idx_platform_muted_users_muter_id").on(t.muterUserId),
    index("idx_platform_muted_users_muted_id").on(t.mutedUserId),
  ],
);

export type PlatformBlockedUser = typeof platformBlockedUsers.$inferSelect;
export type PlatformMutedUser = typeof platformMutedUsers.$inferSelect;
