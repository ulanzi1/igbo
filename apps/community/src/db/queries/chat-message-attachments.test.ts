// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({
  env: { DATABASE_URL: "postgresql://test:test@localhost:5432/test", DATABASE_POOL_SIZE: 1 },
}));

const mockReturning = vi.fn();
const mockValues = vi.fn(() => ({
  returning: mockReturning,
  onConflictDoNothing: vi.fn(() => ({ returning: mockReturning })),
}));
const mockInsert = vi.fn(() => ({ values: mockValues }));
const mockWhere = vi.fn(() => ({ returning: mockReturning }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock("@/db", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    delete: vi.fn(() => ({ where: vi.fn(() => ({ returning: mockReturning })) })),
    transaction: vi.fn(),
  },
}));

describe("chat-message-attachments queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createMessageAttachments", () => {
    it("returns empty array when no attachments provided", async () => {
      const { createMessageAttachments } = await import("./chat-message-attachments");
      const result = await createMessageAttachments("msg-1", []);
      expect(result).toEqual([]);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("inserts attachments with messageId and returns rows", async () => {
      const mockRows = [
        {
          id: "att-1",
          messageId: "msg-1",
          fileUploadId: "fu-1",
          fileUrl: "https://cdn.example.com/img.jpg",
          fileName: "img.jpg",
          fileType: "image/jpeg",
          fileSize: 12345,
          createdAt: new Date(),
        },
      ];
      mockReturning.mockResolvedValueOnce(mockRows);
      const { createMessageAttachments } = await import("./chat-message-attachments");

      const attachments = [
        {
          fileUploadId: "fu-1",
          fileUrl: "https://cdn.example.com/img.jpg",
          fileName: "img.jpg",
          fileType: "image/jpeg" as const,
          fileSize: 12345,
        },
      ];
      const result = await createMessageAttachments("msg-1", attachments);

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(mockRows);
    });
  });

  describe("getMessageAttachments", () => {
    it("selects attachments for a message ID", async () => {
      const mockAttachments = [
        {
          id: "att-1",
          messageId: "msg-1",
          fileUploadId: "fu-1",
          fileUrl: "https://cdn.example.com/img.jpg",
          fileName: "img.jpg",
          fileType: "image/jpeg",
          fileSize: null,
          createdAt: new Date(),
        },
      ];
      mockWhere.mockResolvedValueOnce(mockAttachments);
      const { getMessageAttachments } = await import("./chat-message-attachments");

      const result = await getMessageAttachments("msg-1");
      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual(mockAttachments);
    });
  });

  describe("getAttachmentsForMessages", () => {
    it("returns empty array for empty messageIds", async () => {
      const { getAttachmentsForMessages } = await import("./chat-message-attachments");
      const result = await getAttachmentsForMessages([]);
      expect(result).toEqual([]);
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("queries with inArray for multiple message IDs", async () => {
      const mockAttachments = [
        {
          id: "att-1",
          messageId: "msg-1",
          fileUploadId: "fu-1",
          fileUrl: "https://cdn.example.com/img.jpg",
          fileName: "img.jpg",
          fileType: "image/jpeg",
          fileSize: 12345,
          createdAt: new Date(),
        },
        {
          id: "att-2",
          messageId: "msg-2",
          fileUploadId: "fu-2",
          fileUrl: "https://cdn.example.com/doc.pdf",
          fileName: "doc.pdf",
          fileType: "application/pdf",
          fileSize: 98765,
          createdAt: new Date(),
        },
      ];
      mockWhere.mockResolvedValueOnce(mockAttachments);
      const { getAttachmentsForMessages } = await import("./chat-message-attachments");

      const result = await getAttachmentsForMessages(["msg-1", "msg-2"]);
      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual(mockAttachments);
    });
  });
});
