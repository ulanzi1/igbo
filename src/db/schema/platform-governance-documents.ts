import { pgTable, uuid, varchar, text, integer, timestamp } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const platformGovernanceDocuments = pgTable("platform_governance_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 200 }).unique().notNull(),
  content: text("content").notNull(),
  contentIgbo: text("content_igbo"),
  version: integer("version").notNull().default(1),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  visibility: varchar("visibility", { length: 20 }).notNull().default("public"),
  publishedBy: uuid("published_by").references(() => authUsers.id),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type GovernanceDocument = typeof platformGovernanceDocuments.$inferSelect;
export type NewGovernanceDocument = typeof platformGovernanceDocuments.$inferInsert;
