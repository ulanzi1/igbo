import "server-only";
import { pgTable, uuid, varchar, boolean, index, timestamp } from "drizzle-orm/pg-core";
import { portalSeekerProfiles } from "./portal-seeker-profiles";
import { platformFileUploads } from "./file-uploads";

export const portalSeekerCvs = pgTable(
  "portal_seeker_cvs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seekerProfileId: uuid("seeker_profile_id")
      .notNull()
      .references(() => portalSeekerProfiles.id, { onDelete: "cascade" }),
    fileUploadId: uuid("file_upload_id")
      .notNull()
      .unique()
      .references(() => platformFileUploads.id, { onDelete: "restrict" }),
    label: varchar("label", { length: 100 }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("portal_seeker_cvs_seeker_profile_id_idx").on(table.seekerProfileId),
    // Partial unique index (WHERE is_default = TRUE) is enforced by migration SQL;
    // Drizzle doesn't support conditional indexes natively.
  ],
);

export type PortalSeekerCv = typeof portalSeekerCvs.$inferSelect;
export type NewPortalSeekerCv = typeof portalSeekerCvs.$inferInsert;
