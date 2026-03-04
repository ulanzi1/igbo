import { pgTable, pgEnum, uuid, varchar, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { authUsers } from "./auth-users";
import { communityGroupChannels } from "./community-group-channels";

export const conversationTypeEnum = pgEnum("conversation_type", ["direct", "group", "channel"]);
export const conversationMemberRoleEnum = pgEnum("conversation_member_role", ["member", "admin"]);

export const chatConversations = pgTable("chat_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: conversationTypeEnum("type").notNull(),
  channelId: uuid("channel_id").references(() => communityGroupChannels.id, {
    onDelete: "setNull",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const chatConversationMembers = pgTable(
  "chat_conversation_members",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    notificationPreference: varchar("notification_preference", { length: 20 }).default("all"),
    role: conversationMemberRoleEnum("role").notNull().default("member"),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);

// Relations
export const chatConversationsRelations = relations(chatConversations, ({ many, one }) => ({
  members: many(chatConversationMembers),
  channel: one(communityGroupChannels, {
    fields: [chatConversations.channelId],
    references: [communityGroupChannels.id],
  }),
}));

export const chatConversationMembersRelations = relations(chatConversationMembers, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatConversationMembers.conversationId],
    references: [chatConversations.id],
  }),
  user: one(authUsers, {
    fields: [chatConversationMembers.userId],
    references: [authUsers.id],
  }),
}));

export type ChatConversation = typeof chatConversations.$inferSelect;
export type NewChatConversation = typeof chatConversations.$inferInsert;
export type ChatConversationMember = typeof chatConversationMembers.$inferSelect;
export type NewChatConversationMember = typeof chatConversationMembers.$inferInsert;
export type ConversationType = (typeof conversationTypeEnum.enumValues)[number];
export type ConversationMemberRole = (typeof conversationMemberRoleEnum.enumValues)[number];
