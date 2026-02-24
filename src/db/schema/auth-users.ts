import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["MEMBER", "ADMIN", "MODERATOR"]);

export const accountStatusEnum = pgEnum("account_status", [
  "PENDING_EMAIL_VERIFICATION",
  "PENDING_APPROVAL",
  "INFO_REQUESTED",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
  "BANNED",
]);

export const authUsers = pgTable(
  "auth_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull(),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    name: varchar("name", { length: 255 }),
    phone: varchar("phone", { length: 20 }),
    locationCity: varchar("location_city", { length: 255 }),
    locationState: varchar("location_state", { length: 255 }),
    locationCountry: varchar("location_country", { length: 255 }),
    culturalConnection: text("cultural_connection"),
    reasonForJoining: text("reason_for_joining"),
    referralName: varchar("referral_name", { length: 255 }),
    consentGivenAt: timestamp("consent_given_at", { withTimezone: true }).notNull(),
    consentIp: varchar("consent_ip", { length: 45 }),
    consentVersion: varchar("consent_version", { length: 20 }),
    image: text("image"),
    accountStatus: accountStatusEnum("account_status")
      .notNull()
      .default("PENDING_EMAIL_VERIFICATION"),
    passwordHash: varchar("password_hash", { length: 255 }),
    role: userRoleEnum("role").notNull().default("MEMBER"),
    adminNotes: text("admin_notes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("unq_auth_users_email").on(t.email)],
);

export const authVerificationTokens = pgTable(
  "auth_verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_auth_verification_tokens_token_hash").on(t.tokenHash),
    index("idx_auth_verification_tokens_user_expires").on(t.userId, t.expiresAt),
  ],
);

export type AuthUser = typeof authUsers.$inferSelect;
export type NewAuthUser = typeof authUsers.$inferInsert;
export type AuthVerificationToken = typeof authVerificationTokens.$inferSelect;
export type NewAuthVerificationToken = typeof authVerificationTokens.$inferInsert;
