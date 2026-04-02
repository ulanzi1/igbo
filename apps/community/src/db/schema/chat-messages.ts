import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { pgTable, pgEnum, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { authUsers } from "./auth-users";
import { chatConversations } from "./chat-conversations";

export const messageContentTypeEnum = pgEnum("message_content_type", [
  "text",
  "rich_text",
  "system",
  "shared_post",
]);

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => chatConversations.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  contentType: messageContentTypeEnum("content_type").notNull().default("text"),
  parentMessageId: uuid("parent_message_id").references((): AnyPgColumn => chatMessages.id, {
    onDelete: "set null",
  }),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Relations
export const chatMessagesRelations = relations(chatMessages, ({ one, many }) => ({
  conversation: one(chatConversations, {
    fields: [chatMessages.conversationId],
    references: [chatConversations.id],
  }),
  sender: one(authUsers, {
    fields: [chatMessages.senderId],
    references: [authUsers.id],
  }),
  parentMessage: one(chatMessages, {
    fields: [chatMessages.parentMessageId],
    references: [chatMessages.id],
    relationName: "threadReplies",
  }),
  replies: many(chatMessages, { relationName: "threadReplies" }),
}));

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type MessageContentType = (typeof messageContentTypeEnum.enumValues)[number];
