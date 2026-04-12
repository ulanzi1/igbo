import "server-only";
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";
import { portalApplications } from "./portal-applications";

/**
 * Private employer notes attached to an application. Append-only and
 * immutable — notes cannot be edited or deleted once written, per
 * Story P-2.10 AC-4. Visible only to the owning company's employers.
 */
export const portalApplicationNotes = pgTable(
  "portal_application_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => portalApplications.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    appIdCreatedIdx: index("portal_application_notes_app_id_created_idx").on(
      table.applicationId,
      table.createdAt,
    ),
  }),
);

export type PortalApplicationNote = typeof portalApplicationNotes.$inferSelect;
export type NewPortalApplicationNote = typeof portalApplicationNotes.$inferInsert;
