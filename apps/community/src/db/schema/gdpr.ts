import { pgTable, uuid, varchar, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const gdprExportRequests = pgTable(
  "gdpr_export_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    downloadToken: varchar("download_token", { length: 64 }),
    exportData: jsonb("export_data"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("gdpr_export_requests_user_id_idx").on(t.userId),
    uniqueIndex("gdpr_export_requests_token_idx").on(t.downloadToken),
  ],
);

export type GdprExportRequest = typeof gdprExportRequests.$inferSelect;
export type NewGdprExportRequest = typeof gdprExportRequests.$inferInsert;
