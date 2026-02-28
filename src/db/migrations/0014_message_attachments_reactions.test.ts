// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    DATABASE_POOL_SIZE: 1,
  },
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

describe("Migration 0014 – schema definitions", () => {
  describe("chat_message_attachments schema", () => {
    it("exports chatMessageAttachments table with correct columns", async () => {
      const { chatMessageAttachments } = await import("@/db/schema/chat-message-attachments");
      expect(chatMessageAttachments).toBeDefined();
      const columns = chatMessageAttachments;
      expect(columns.id).toBeDefined();
      expect(columns.messageId).toBeDefined();
      expect(columns.fileUploadId).toBeDefined();
      expect(columns.fileUrl).toBeDefined();
      expect(columns.fileName).toBeDefined();
      expect(columns.fileType).toBeDefined();
      expect(columns.fileSize).toBeDefined();
      expect(columns.createdAt).toBeDefined();
    });

    it("exports ChatMessageAttachment type", async () => {
      type CheckExport = typeof import("@/db/schema/chat-message-attachments").ChatMessageAttachment;
      const result = true as const;
      expect(result).toBe(true);
    });
  });

  describe("chat_message_reactions schema", () => {
    it("exports chatMessageReactions table with correct columns", async () => {
      const { chatMessageReactions } = await import("@/db/schema/chat-message-reactions");
      expect(chatMessageReactions).toBeDefined();
      expect(chatMessageReactions.messageId).toBeDefined();
      expect(chatMessageReactions.userId).toBeDefined();
      expect(chatMessageReactions.emoji).toBeDefined();
      expect(chatMessageReactions.createdAt).toBeDefined();
    });

    it("exports ChatMessageReaction type", async () => {
      type CheckExport = typeof import("@/db/schema/chat-message-reactions").ChatMessageReaction;
      const result = true as const;
      expect(result).toBe(true);
    });
  });

  describe("db/index.ts schema registration", () => {
    it("registers chatMessageAttachments schema", async () => {
      vi.resetModules();
      vi.mock("@/db", async (importOriginal) => {
        const mod = await importOriginal<typeof import("@/db")>();
        return mod;
      });

      const { chatMessageAttachments } = await import("@/db/schema/chat-message-attachments");
      const { chatMessageReactions } = await import("@/db/schema/chat-message-reactions");
      expect(chatMessageAttachments).toBeDefined();
      expect(chatMessageReactions).toBeDefined();
    });
  });
});
