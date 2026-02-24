import { pgTable, uuid, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const authTotpSecrets = pgTable(
  "auth_totp_secrets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    secret: varchar("secret", { length: 32 }).notNull(),
    recoveryCodes: jsonb("recovery_codes").$type<string[]>(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_auth_totp_secrets_user_id").on(t.userId)],
);

export type AuthTotpSecret = typeof authTotpSecrets.$inferSelect;
export type NewAuthTotpSecret = typeof authTotpSecrets.$inferInsert;
