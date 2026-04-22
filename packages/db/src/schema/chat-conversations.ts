import { pgTable, pgEnum, uuid, varchar, timestamp, primaryKey, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { authUsers } from "./auth-users";
import { communityGroupChannels } from "./community-group-channels";

export const conversationTypeEnum = pgEnum("conversation_type", ["direct", "group", "channel"]);
export const conversationMemberRoleEnum = pgEnum("conversation_member_role", ["member", "admin"]);
export const conversationContextEnum = pgEnum("conversation_context", ["community", "portal"]);
export const participantRoleEnum = pgEnum("participant_role_type", [
  "employer",
  "seeker",
  "community_member",
]);

/**
 * Denormalized metadata for portal conversations — stored in portal_context_json.
 * Only populated for context='portal'. Community conversations have this as NULL.
 * Note: jobTitle/companyName can go stale if posting is edited after conversation creation.
 * This is accepted for MVP — portal tables remain source of truth.
 */
export interface PortalConversationContext {
  jobId: string;
  companyId: string;
  jobTitle: string;
  companyName: string;
}

export const chatConversations = pgTable("chat_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: conversationTypeEnum("type").notNull(),
  context: conversationContextEnum("context").notNull().default("community"),
  channelId: uuid("channel_id").references(() => communityGroupChannels.id, {
    onDelete: "set null",
  }),
  // Raw UUID — NOT a Drizzle FK reference to portalApplications because that schema
  // imports "server-only" which crashes the standalone realtime server (plain Node.js).
  // The FK constraint is enforced in migration 0073 SQL.
  applicationId: uuid("application_id"),
  // Portal-only JSONB metadata (nullable — community conversations keep this NULL)
  portalContextJson: jsonb("portal_context_json").$type<PortalConversationContext | null>(),
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
    // Domain-level identity (orthogonal to conversation-level `role` above)
    // employer/seeker = portal participants; community_member = default for all community members
    participantRole: participantRoleEnum("participant_role").notNull().default("community_member"),
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
export type ConversationContext = (typeof conversationContextEnum.enumValues)[number];
export type ParticipantRole = (typeof participantRoleEnum.enumValues)[number];
