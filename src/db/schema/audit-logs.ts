import { pgTable, uuid, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => authUsers.id),
  action: varchar("action", { length: 100 }).notNull(),
  targetUserId: uuid("target_user_id"),
  details: jsonb("details"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
