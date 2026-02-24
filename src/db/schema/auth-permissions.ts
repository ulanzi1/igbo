import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const membershipTierEnum = pgEnum("membership_tier", ["BASIC", "PROFESSIONAL", "TOP_TIER"]);

export const authRoles = pgTable("auth_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const authUserRoles = pgTable(
  "auth_user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => authRoles.id, { onDelete: "cascade" }),
    assignedBy: uuid("assigned_by").references(() => authUsers.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("unq_auth_user_roles_user_role").on(t.userId, t.roleId),
    index("idx_auth_user_roles_user_id").on(t.userId),
  ],
);

export type AuthRole = typeof authRoles.$inferSelect;
export type NewAuthRole = typeof authRoles.$inferInsert;
export type AuthUserRole = typeof authUserRoles.$inferSelect;
export type NewAuthUserRole = typeof authUserRoles.$inferInsert;
