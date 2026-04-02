import { pgTable, uuid, varchar, bigint, text, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { chatMessages } from "./chat-messages";
import { platformFileUploads } from "./file-uploads";

export const chatMessageAttachments = pgTable(
  "chat_message_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    fileUploadId: uuid("file_upload_id")
      .notNull()
      .references(() => platformFileUploads.id, { onDelete: "cascade" }),
    fileUrl: text("file_url").notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileType: varchar("file_type", { length: 50 }),
    fileSize: bigint("file_size", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_chat_message_attachments_message_id").on(t.messageId)],
);

export const chatMessageAttachmentsRelations = relations(chatMessageAttachments, ({ one }) => ({
  message: one(chatMessages, {
    fields: [chatMessageAttachments.messageId],
    references: [chatMessages.id],
  }),
  fileUpload: one(platformFileUploads, {
    fields: [chatMessageAttachments.fileUploadId],
    references: [platformFileUploads.id],
  }),
}));

export type ChatMessageAttachment = typeof chatMessageAttachments.$inferSelect;
export type NewChatMessageAttachment = typeof chatMessageAttachments.$inferInsert;
