// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  chatConversations,
  chatConversationMembers,
  conversationTypeEnum,
  conversationMemberRoleEnum,
} from "./chat-conversations";

describe("chat-conversations schema", () => {
  it("chatConversations table has expected columns", () => {
    const cols = Object.keys(chatConversations);
    expect(cols).toContain("id");
    expect(cols).toContain("type");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
    expect(cols).toContain("deletedAt");
  });

  it("conversationTypeEnum has correct values", () => {
    expect(conversationTypeEnum.enumValues).toEqual(["direct", "group", "channel"]);
  });

  it("conversationMemberRoleEnum has correct values", () => {
    expect(conversationMemberRoleEnum.enumValues).toEqual(["member", "admin"]);
  });

  it("chatConversationMembers table has expected columns", () => {
    const cols = Object.keys(chatConversationMembers);
    expect(cols).toContain("conversationId");
    expect(cols).toContain("userId");
    expect(cols).toContain("joinedAt");
    expect(cols).toContain("lastReadAt");
    expect(cols).toContain("notificationPreference");
    expect(cols).toContain("role");
  });

  it("chatConversations primary key is id column", () => {
    expect(chatConversations.id.primary).toBe(true);
  });
});
