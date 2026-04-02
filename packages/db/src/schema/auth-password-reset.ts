import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const authPasswordResetTokens = pgTable(
  "auth_password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_auth_password_reset_tokens_token_hash").on(t.tokenHash),
    index("idx_auth_password_reset_tokens_user_expires").on(t.userId, t.expiresAt),
  ],
);

export type AuthPasswordResetToken = typeof authPasswordResetTokens.$inferSelect;
export type NewAuthPasswordResetToken = typeof authPasswordResetTokens.$inferInsert;
