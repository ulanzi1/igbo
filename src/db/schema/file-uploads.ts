import { pgTable, uuid, varchar, bigint, text, timestamp, index } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const platformFileUploads = pgTable(
  "platform_file_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    uploaderId: uuid("uploader_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    objectKey: varchar("object_key", { length: 512 }).notNull().unique(),
    originalFilename: varchar("original_filename", { length: 255 }),
    fileType: varchar("file_type", { length: 50 }),
    fileSize: bigint("file_size", { mode: "number" }),
    status: varchar("status", { length: 20 })
      .notNull()
      .default("processing")
      .$type<"processing" | "pending_scan" | "ready" | "quarantined" | "deleted">(),
    processedUrl: text("processed_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("platform_file_uploads_uploader_id_idx").on(t.uploaderId),
    index("platform_file_uploads_status_idx").on(t.status),
  ],
);

export type PlatformFileUpload = typeof platformFileUploads.$inferSelect;
export type NewPlatformFileUpload = typeof platformFileUploads.$inferInsert;
