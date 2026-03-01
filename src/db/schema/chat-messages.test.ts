// @vitest-environment node
import { describe, it, expect } from "vitest";
import { chatMessages, messageContentTypeEnum } from "./chat-messages";

describe("chat-messages schema", () => {
  it("chatMessages table has expected columns", () => {
    const cols = Object.keys(chatMessages);
    expect(cols).toContain("id");
    expect(cols).toContain("conversationId");
    expect(cols).toContain("senderId");
    expect(cols).toContain("content");
    expect(cols).toContain("contentType");
    expect(cols).toContain("parentMessageId");
    expect(cols).toContain("editedAt");
    expect(cols).toContain("deletedAt");
    expect(cols).toContain("createdAt");
  });

  it("messageContentTypeEnum has correct values", () => {
    expect(messageContentTypeEnum.enumValues).toEqual([
      "text",
      "rich_text",
      "system",
      "shared_post",
    ]);
  });

  it("chatMessages primary key is id column", () => {
    expect(chatMessages.id.primary).toBe(true);
  });
});
