import { pgTable, uuid, varchar, timestamp, index, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { chatMessages } from "./chat-messages";
import { authUsers } from "./auth-users";

export const chatMessageReactions = pgTable(
  "chat_message_reactions",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    emoji: varchar("emoji", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.userId, t.emoji] }),
    index("idx_chat_message_reactions_message_id").on(t.messageId),
  ],
);

export const chatMessageReactionsRelations = relations(chatMessageReactions, ({ one }) => ({
  message: one(chatMessages, {
    fields: [chatMessageReactions.messageId],
    references: [chatMessages.id],
  }),
  user: one(authUsers, {
    fields: [chatMessageReactions.userId],
    references: [authUsers.id],
  }),
}));

export type ChatMessageReaction = typeof chatMessageReactions.$inferSelect;
export type NewChatMessageReaction = typeof chatMessageReactions.$inferInsert;
