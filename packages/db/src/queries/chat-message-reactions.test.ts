// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockReturning = vi.fn();
const mockOnConflict = vi.fn(() => ({ returning: mockReturning }));
const mockValues = vi.fn(() => ({ returning: mockReturning, onConflictDoNothing: mockOnConflict }));
const mockInsert = vi.fn(() => ({ values: mockValues }));

const mockDeleteReturning = vi.fn();
const mockDeleteWhere = vi.fn(() => ({ returning: mockDeleteReturning }));
const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }));

const mockSelectWhere = vi.fn(() => Promise.resolve([]));
const mockFrom = vi.fn(() => ({ where: mockSelectWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock("../index", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    delete: mockDelete,
    transaction: vi.fn(),
  },
}));

describe("chat-message-reactions queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("addReaction", () => {
    it("inserts a reaction and returns created row", async () => {
      const mockReaction = {
        messageId: "msg-1",
        userId: "user-1",
        emoji: "👍",
        createdAt: new Date(),
      };
      mockReturning.mockResolvedValueOnce([mockReaction]);
      const { addReaction } = await import("./chat-message-reactions");

      const result = await addReaction("msg-1", "user-1", "👍");
      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(mockReaction);
    });

    it("returns null when reaction already exists (onConflictDoNothing returns empty)", async () => {
      mockReturning.mockResolvedValueOnce([]);
      const { addReaction } = await import("./chat-message-reactions");

      const result = await addReaction("msg-1", "user-1", "👍");
      expect(result).toBeNull();
    });
  });

  describe("removeReaction", () => {
    it("returns true when reaction was deleted", async () => {
      mockDeleteReturning.mockResolvedValueOnce([{ messageId: "msg-1" }]);
      const { removeReaction } = await import("./chat-message-reactions");

      const result = await removeReaction("msg-1", "user-1", "👍");
      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it("returns false when reaction did not exist", async () => {
      mockDeleteReturning.mockResolvedValueOnce([]);
      const { removeReaction } = await import("./chat-message-reactions");

      const result = await removeReaction("msg-1", "user-1", "👍");
      expect(result).toBe(false);
    });
  });

  describe("getReactionsForMessage", () => {
    it("selects reactions for a message ID", async () => {
      const mockReactions = [
        { messageId: "msg-1", userId: "user-1", emoji: "👍", createdAt: new Date() },
        { messageId: "msg-1", userId: "user-2", emoji: "❤️", createdAt: new Date() },
      ];
      mockSelectWhere.mockResolvedValueOnce(mockReactions);
      const { getReactionsForMessage } = await import("./chat-message-reactions");

      const result = await getReactionsForMessage("msg-1");
      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual(mockReactions);
    });
  });

  describe("getReactionsForMessages", () => {
    it("returns empty array for empty messageIds", async () => {
      const { getReactionsForMessages } = await import("./chat-message-reactions");
      const result = await getReactionsForMessages([]);
      expect(result).toEqual([]);
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("batch-loads reactions for multiple message IDs", async () => {
      const mockReactions = [
        { messageId: "msg-1", userId: "user-1", emoji: "👍", createdAt: new Date() },
        { messageId: "msg-2", userId: "user-2", emoji: "🔥", createdAt: new Date() },
      ];
      mockSelectWhere.mockResolvedValueOnce(mockReactions);
      const { getReactionsForMessages } = await import("./chat-message-reactions");

      const result = await getReactionsForMessages(["msg-1", "msg-2"]);
      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual(mockReactions);
    });
  });
});
