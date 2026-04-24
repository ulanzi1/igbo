// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Hoisted mock factories ──────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  execute: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@igbo/db", () => ({
  db: mockDb,
  createPortalConversation: vi.fn(),
  getPortalConversationByApplicationId: vi.fn(),
  getPortalConversationsForUser: vi.fn(),
  isPortalConversationReadOnly: vi.fn(),
  getPortalConversationParticipantRole: vi.fn(),
}));

vi.mock("@igbo/db/queries/chat-messages", () => ({
  createMessage: vi.fn(),
  getConversationMessages: vi.fn(),
}));

vi.mock("@igbo/db/queries/chat-conversations", () => ({
  isConversationMember: vi.fn(),
  getUnreadCountForConversation: vi.fn(),
}));

vi.mock("@igbo/db/queries/chat-message-attachments", () => ({
  createMessageAttachments: vi.fn(),
  getAttachmentsForMessages: vi.fn(),
}));

vi.mock("@igbo/db/queries/file-uploads", () => ({
  getFileUploadById: vi.fn(),
}));

vi.mock("@/lib/build-s3-public-url", () => ({
  buildS3PublicUrl: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    __sql: true,
    strings,
    values,
  })),
}));

const mockPortalEventBus = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock("@/services/event-bus", () => ({
  portalEventBus: mockPortalEventBus,
}));

import {
  createPortalConversation,
  getPortalConversationByApplicationId,
  getPortalConversationsForUser,
} from "@igbo/db";
import { createMessage, getConversationMessages } from "@igbo/db/queries/chat-messages";
import {
  isConversationMember,
  getUnreadCountForConversation,
} from "@igbo/db/queries/chat-conversations";
import {
  createMessageAttachments,
  getAttachmentsForMessages,
} from "@igbo/db/queries/chat-message-attachments";
import { getFileUploadById } from "@igbo/db/queries/file-uploads";
import { buildS3PublicUrl } from "@/lib/build-s3-public-url";
import {
  sendMessage,
  getPortalConversationMessages,
  listUserConversations,
  getConversationStatus,
} from "./conversation-service";

// ── Constants ───────────────────────────────────────────────────────────────

const APP_ID = "00000000-0000-4000-8000-000000000001";
const CONV_ID = "00000000-0000-4000-8000-000000000002";
const EMPLOYER_ID = "00000000-0000-4000-8000-000000000003";
const SEEKER_ID = "00000000-0000-4000-8000-000000000004";
const JOB_ID = "00000000-0000-4000-8000-000000000005";
const COMPANY_ID = "00000000-0000-4000-8000-000000000006";
const MSG_ID = "00000000-0000-4000-8000-000000000007";
const FILE_UPLOAD_ID = "00000000-0000-4000-8000-000000000010";
const ATTACHMENT_ID = "00000000-0000-4000-8000-000000000011";
const S3_URL = "https://test-bucket.example.com/portal/messages/user-123/uuid.pdf";

const mockFileUpload = {
  id: FILE_UPLOAD_ID,
  uploaderId: EMPLOYER_ID,
  objectKey: "portal/messages/user-123/uuid.pdf",
  originalFilename: "resume.pdf",
  fileType: "application/pdf",
  fileSize: 12345,
  status: "ready" as const,
  processedUrl: null,
  createdAt: new Date(),
};

const mockAttachment = {
  id: ATTACHMENT_ID,
  messageId: MSG_ID,
  fileUploadId: FILE_UPLOAD_ID,
  fileUrl: S3_URL,
  fileName: "resume.pdf",
  fileType: "application/pdf",
  fileSize: 12345,
  createdAt: new Date(),
};

const mockAppRow = {
  application_id: APP_ID,
  seeker_user_id: SEEKER_ID,
  employer_user_id: EMPLOYER_ID,
  status: "submitted",
  job_id: JOB_ID,
  job_title: "Software Engineer",
  company_id: COMPANY_ID,
  company_name: "Tech Corp",
};

const mockConversation = {
  id: CONV_ID,
  type: "direct" as const,
  context: "portal" as const,
  applicationId: APP_ID,
  channelId: null,
  portalContextJson: {
    jobId: JOB_ID,
    companyId: COMPANY_ID,
    jobTitle: "Software Engineer",
    companyName: "Tech Corp",
  },
  deletedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const mockConvWithMembers = {
  conversation: mockConversation,
  members: [
    { userId: EMPLOYER_ID, participantRole: "employer" as const },
    { userId: SEEKER_ID, participantRole: "seeker" as const },
  ],
};

const mockMessage = {
  id: MSG_ID,
  conversationId: CONV_ID,
  senderId: EMPLOYER_ID,
  content: "Hello candidate!",
  contentType: "text" as const,
  parentMessageId: null,
  editedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-01-01T12:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: application exists, non-terminal status
  mockDb.execute.mockResolvedValue([mockAppRow]);
  // Default: no existing conversation
  vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(null);
  vi.mocked(createPortalConversation).mockResolvedValue(mockConversation);
  vi.mocked(createMessage).mockResolvedValue(mockMessage);
  // Default transaction passes through callback (does NOT reset createMessage — tests control that)
  mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    return cb({});
  });
  vi.mocked(isConversationMember).mockResolvedValue(true);
  vi.mocked(getUnreadCountForConversation).mockResolvedValue(0);
  // Attachment-related defaults
  vi.mocked(getFileUploadById).mockResolvedValue(null);
  vi.mocked(createMessageAttachments).mockResolvedValue([]);
  vi.mocked(getAttachmentsForMessages).mockResolvedValue([]);
  vi.mocked(buildS3PublicUrl).mockReturnValue(S3_URL);
});

// ── sendMessage — employer first message ────────────────────────────────────

describe("sendMessage — employer first message", () => {
  it("creates conversation + message atomically and emits event", async () => {
    const result = await sendMessage({
      applicationId: APP_ID,
      senderId: EMPLOYER_ID,
      senderPortalRole: "EMPLOYER",
      content: "Hello candidate!",
    });

    expect(mockDb.transaction).toHaveBeenCalledOnce();
    expect(createPortalConversation).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: APP_ID }),
      expect.anything(),
    );
    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: CONV_ID, senderId: EMPLOYER_ID }),
      expect.anything(),
    );
    expect(result.conversationCreated).toBe(true);
    expect(result.conversationId).toBe(CONV_ID);
    expect(result.message.id).toBe(MSG_ID);
  });

  it("emits portal.message.sent event after transaction", async () => {
    await sendMessage({
      applicationId: APP_ID,
      senderId: EMPLOYER_ID,
      senderPortalRole: "EMPLOYER",
      content: "Hello!",
    });

    expect(mockPortalEventBus.emit).toHaveBeenCalledWith(
      "portal.message.sent",
      expect.objectContaining({
        messageId: MSG_ID,
        senderId: EMPLOYER_ID,
        conversationId: CONV_ID,
        applicationId: APP_ID,
        senderRole: "employer",
        recipientId: SEEKER_ID,
      }),
    );
  });

  it("event emitted AFTER transaction (emit called after tx resolves)", async () => {
    const callOrder: string[] = [];
    mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const result = await cb({});
      callOrder.push("transaction-done");
      return result;
    });
    vi.mocked(createPortalConversation).mockResolvedValue(mockConversation);
    vi.mocked(createMessage).mockResolvedValue(mockMessage);
    mockPortalEventBus.emit.mockImplementation(() => {
      callOrder.push("emit");
      return true;
    });

    await sendMessage({
      applicationId: APP_ID,
      senderId: EMPLOYER_ID,
      senderPortalRole: "EMPLOYER",
      content: "Hello!",
    });

    expect(callOrder).toEqual(["transaction-done", "emit"]);
  });
});

// ── sendMessage — employer subsequent message ───────────────────────────────

describe("sendMessage — employer subsequent message", () => {
  it("finds existing conversation, inserts message, emits event", async () => {
    vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(mockConvWithMembers);

    const result = await sendMessage({
      applicationId: APP_ID,
      senderId: EMPLOYER_ID,
      senderPortalRole: "EMPLOYER",
      content: "Following up!",
    });

    expect(mockDb.transaction).toHaveBeenCalledOnce();
    expect(createPortalConversation).not.toHaveBeenCalled();
    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: CONV_ID }),
      expect.anything(),
    );
    expect(result.conversationCreated).toBe(false);
    expect(mockPortalEventBus.emit).toHaveBeenCalledWith("portal.message.sent", expect.anything());
  });
});

// ── sendMessage — seeker replies ────────────────────────────────────────────

describe("sendMessage — seeker replies", () => {
  it("succeeds when conversation exists and seeker is a participant", async () => {
    vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(mockConvWithMembers);

    const seekerMessage = { ...mockMessage, senderId: SEEKER_ID };
    vi.mocked(createMessage).mockResolvedValue(seekerMessage);

    const result = await sendMessage({
      applicationId: APP_ID,
      senderId: SEEKER_ID,
      senderPortalRole: "JOB_SEEKER",
      content: "Thank you!",
    });

    expect(result.message.senderId).toBe(SEEKER_ID);
    expect(mockPortalEventBus.emit).toHaveBeenCalledWith(
      "portal.message.sent",
      expect.objectContaining({
        senderId: SEEKER_ID,
        senderRole: "seeker",
        recipientId: EMPLOYER_ID,
      }),
    );
  });
});

// ── sendMessage — seeker cannot initiate ────────────────────────────────────

describe("sendMessage — seeker cannot initiate", () => {
  it("rejects with SEEKER_CANNOT_INITIATE on submitted application (no existing conv)", async () => {
    // No conversation exists (default), application status = submitted
    mockDb.execute.mockResolvedValue([{ ...mockAppRow, status: "submitted" }]);

    await expect(
      sendMessage({
        applicationId: APP_ID,
        senderId: SEEKER_ID,
        senderPortalRole: "JOB_SEEKER",
        content: "Hello!",
      }),
    ).rejects.toMatchObject({ status: 403, detail: "PORTAL_ERRORS.SEEKER_CANNOT_INITIATE" });
  });

  it("rejects with 404 on under_review application when no conversation exists", async () => {
    mockDb.execute.mockResolvedValue([{ ...mockAppRow, status: "under_review" }]);

    await expect(
      sendMessage({
        applicationId: APP_ID,
        senderId: SEEKER_ID,
        senderPortalRole: "JOB_SEEKER",
        content: "Hello!",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("succeeds when seeker replies on under_review application with existing conversation", async () => {
    mockDb.execute.mockResolvedValue([{ ...mockAppRow, status: "under_review" }]);
    vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(mockConvWithMembers);

    const result = await sendMessage({
      applicationId: APP_ID,
      senderId: SEEKER_ID,
      senderPortalRole: "JOB_SEEKER",
      content: "Looking forward to it!",
    });

    expect(result.conversationCreated).toBe(false);
  });
});

// ── sendMessage — terminal state ────────────────────────────────────────────

describe("sendMessage — terminal state", () => {
  it("rejects with CONVERSATION_READ_ONLY when application is rejected", async () => {
    mockDb.execute.mockResolvedValue([{ ...mockAppRow, status: "rejected" }]);

    await expect(
      sendMessage({
        applicationId: APP_ID,
        senderId: EMPLOYER_ID,
        senderPortalRole: "EMPLOYER",
        content: "We'd like to offer you the role.",
      }),
    ).rejects.toMatchObject({ status: 403, detail: "PORTAL_ERRORS.CONVERSATION_READ_ONLY" });
  });

  it("rejects for seeker too when application is terminal", async () => {
    mockDb.execute.mockResolvedValue([{ ...mockAppRow, status: "withdrawn" }]);
    vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(mockConvWithMembers);

    await expect(
      sendMessage({
        applicationId: APP_ID,
        senderId: SEEKER_ID,
        senderPortalRole: "JOB_SEEKER",
        content: "Thanks for the update.",
      }),
    ).rejects.toMatchObject({ status: 403, detail: "PORTAL_ERRORS.CONVERSATION_READ_ONLY" });
  });

  it("rejects for hired status too", async () => {
    mockDb.execute.mockResolvedValue([{ ...mockAppRow, status: "hired" }]);

    await expect(
      sendMessage({
        applicationId: APP_ID,
        senderId: EMPLOYER_ID,
        senderPortalRole: "EMPLOYER",
        content: "Welcome aboard!",
      }),
    ).rejects.toMatchObject({ status: 403, detail: "PORTAL_ERRORS.CONVERSATION_READ_ONLY" });
  });
});

// ── sendMessage — application not found ─────────────────────────────────────

describe("sendMessage — application not found", () => {
  it("rejects with 404 when application does not exist", async () => {
    mockDb.execute.mockResolvedValue([]);

    await expect(
      sendMessage({
        applicationId: "non-existent",
        senderId: EMPLOYER_ID,
        senderPortalRole: "EMPLOYER",
        content: "Hello!",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ── sendMessage — non-participant ───────────────────────────────────────────

describe("sendMessage — non-participant", () => {
  it("rejects with 404 when sender is not a participant (existing conv)", async () => {
    vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(mockConvWithMembers);
    vi.mocked(isConversationMember).mockResolvedValue(false);

    const OTHER_USER = "other-user-id";

    await expect(
      sendMessage({
        applicationId: APP_ID,
        senderId: OTHER_USER,
        senderPortalRole: "EMPLOYER",
        content: "Hello!",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ── sendMessage — employer mismatch on first message ─────────────────────────

describe("sendMessage — employer mismatch", () => {
  it("rejects with 404 when a different employer tries to initiate", async () => {
    const DIFFERENT_EMPLOYER = "00000000-0000-4000-8000-000000000099";

    await expect(
      sendMessage({
        applicationId: APP_ID,
        senderId: DIFFERENT_EMPLOYER,
        senderPortalRole: "EMPLOYER",
        content: "Hello!",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ── sendMessage — race condition ─────────────────────────────────────────────

describe("sendMessage — race condition", () => {
  it("retries with existing conversation on unique constraint violation", async () => {
    const uniqueErr = Object.assign(new Error("Unique violation"), { code: "23505" });
    mockDb.transaction.mockRejectedValueOnce(uniqueErr);
    // Second transaction call (recovery) uses the default beforeEach implementation
    vi.mocked(getPortalConversationByApplicationId)
      .mockResolvedValueOnce(null) // first call: no conv
      .mockResolvedValueOnce(mockConvWithMembers); // after race: conv exists

    const result = await sendMessage({
      applicationId: APP_ID,
      senderId: EMPLOYER_ID,
      senderPortalRole: "EMPLOYER",
      content: "Hello!",
    });

    expect(result.conversationId).toBe(CONV_ID);
    expect(result.conversationCreated).toBe(false);
    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: CONV_ID }),
      expect.anything(),
    );
  });
});

// ── sendMessage — event payload ─────────────────────────────────────────────

describe("sendMessage — event payload", () => {
  it("emits event with all required fields", async () => {
    await sendMessage({
      applicationId: APP_ID,
      senderId: EMPLOYER_ID,
      senderPortalRole: "EMPLOYER",
      content: "Hello candidate!",
      contentType: "text",
      parentMessageId: null,
    });

    const emitCall = mockPortalEventBus.emit.mock.calls[0];
    expect(emitCall?.[0]).toBe("portal.message.sent");
    const payload = emitCall?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({
      messageId: MSG_ID,
      senderId: EMPLOYER_ID,
      conversationId: CONV_ID,
      applicationId: APP_ID,
      jobId: JOB_ID,
      companyId: COMPANY_ID,
      jobTitle: "Software Engineer",
      companyName: "Tech Corp",
      content: "Hello candidate!",
      contentType: "text",
      senderRole: "employer",
      recipientId: SEEKER_ID,
    });
    expect(typeof payload["createdAt"]).toBe("string");
  });
});

// ── sendMessage — content validation ────────────────────────────────────────

describe("sendMessage — content validation", () => {
  it("rejects empty content with 400", async () => {
    await expect(
      sendMessage({
        applicationId: APP_ID,
        senderId: EMPLOYER_ID,
        senderPortalRole: "EMPLOYER",
        content: "",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects whitespace-only content with 400", async () => {
    await expect(
      sendMessage({
        applicationId: APP_ID,
        senderId: EMPLOYER_ID,
        senderPortalRole: "EMPLOYER",
        content: "   ",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects content exceeding 5000 characters with 400", async () => {
    const longContent = "a".repeat(5001);

    await expect(
      sendMessage({
        applicationId: APP_ID,
        senderId: EMPLOYER_ID,
        senderPortalRole: "EMPLOYER",
        content: longContent,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("accepts content exactly at 5000 characters", async () => {
    const maxContent = "a".repeat(5000);

    const result = await sendMessage({
      applicationId: APP_ID,
      senderId: EMPLOYER_ID,
      senderPortalRole: "EMPLOYER",
      content: maxContent,
    });

    expect(result.conversationId).toBe(CONV_ID);
  });
});

// ── sendMessage — multi-application isolation ────────────────────────────────

describe("sendMessage — multi-application isolation", () => {
  it("creates separate conversations for different applicationIds", async () => {
    const APP_ID_2 = "00000000-0000-4000-8000-000000000099";
    const CONV_ID_2 = "00000000-0000-4000-8000-000000000098";
    const mockConversation2 = { ...mockConversation, id: CONV_ID_2, applicationId: APP_ID_2 };

    vi.mocked(createPortalConversation)
      .mockResolvedValueOnce(mockConversation)
      .mockResolvedValueOnce(mockConversation2);

    const result1 = await sendMessage({
      applicationId: APP_ID,
      senderId: EMPLOYER_ID,
      senderPortalRole: "EMPLOYER",
      content: "Hello for app 1",
    });

    const result2 = await sendMessage({
      applicationId: APP_ID_2,
      senderId: EMPLOYER_ID,
      senderPortalRole: "EMPLOYER",
      content: "Hello for app 2",
    });

    expect(result1.conversationId).not.toBe(result2.conversationId);
    expect(createPortalConversation).toHaveBeenCalledTimes(2);
  });
});

// ── getPortalConversationMessages ────────────────────────────────────────────

describe("getPortalConversationMessages", () => {
  it("returns paginated messages for a participant", async () => {
    vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(mockConvWithMembers);
    vi.mocked(isConversationMember).mockResolvedValue(true);
    vi.mocked(getConversationMessages).mockResolvedValue({
      messages: [mockMessage],
      hasMore: false,
    });

    const result = await getPortalConversationMessages(APP_ID, EMPLOYER_ID);

    expect(result.messages).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  it("rejects with 404 when non-participant requests messages", async () => {
    vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(mockConvWithMembers);
    vi.mocked(isConversationMember).mockResolvedValue(false);

    await expect(getPortalConversationMessages(APP_ID, "non-participant-id")).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it("rejects with 404 when conversation does not exist", async () => {
    vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(null);

    await expect(getPortalConversationMessages(APP_ID, EMPLOYER_ID)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("returns empty messages for empty conversation", async () => {
    vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(mockConvWithMembers);
    vi.mocked(getConversationMessages).mockResolvedValue({ messages: [], hasMore: false });

    const result = await getPortalConversationMessages(APP_ID, EMPLOYER_ID);

    expect(result.messages).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("returns hasMore: false when exactly at limit", async () => {
    vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(mockConvWithMembers);
    const msgs = Array.from({ length: 20 }, (_, i) => ({
      ...mockMessage,
      id: `msg-${i}`,
    }));
    vi.mocked(getConversationMessages).mockResolvedValue({ messages: msgs, hasMore: false });

    const result = await getPortalConversationMessages(APP_ID, EMPLOYER_ID, { limit: 20 });

    expect(result.hasMore).toBe(false);
    expect(result.messages).toHaveLength(20);
  });

  it("returns hasMore: true when more messages exist beyond limit", async () => {
    vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(mockConvWithMembers);
    const msgs = Array.from({ length: 10 }, (_, i) => ({
      ...mockMessage,
      id: `msg-${i}`,
    }));
    vi.mocked(getConversationMessages).mockResolvedValue({ messages: msgs, hasMore: true });

    const result = await getPortalConversationMessages(APP_ID, EMPLOYER_ID, { limit: 10 });

    expect(result.hasMore).toBe(true);
    expect(result.messages).toHaveLength(10);
  });

  it("allows reading messages when application is in terminal state (read-only)", async () => {
    // Read-only conversations should still be readable (only writes are blocked)
    mockDb.execute.mockResolvedValue([{ ...mockAppRow, status: "rejected" }]);
    vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(mockConvWithMembers);
    vi.mocked(getConversationMessages).mockResolvedValue({
      messages: [mockMessage],
      hasMore: false,
    });

    const result = await getPortalConversationMessages(APP_ID, EMPLOYER_ID);

    expect(result.messages).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });
});

// ── listUserConversations ────────────────────────────────────────────────────

describe("listUserConversations", () => {
  it("delegates to getPortalConversationsForUser", async () => {
    vi.mocked(getPortalConversationsForUser).mockResolvedValue({
      conversations: [],
      hasMore: false,
    });

    await listUserConversations(EMPLOYER_ID, { limit: 10 });

    expect(getPortalConversationsForUser).toHaveBeenCalledWith(EMPLOYER_ID, { limit: 10 });
  });
});

// ── getConversationStatus ────────────────────────────────────────────────────

describe("getConversationStatus", () => {
  it("returns exists=true, readOnly=false, unreadCount=0 for active conversation with no unread", async () => {
    vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(mockConvWithMembers);
    vi.mocked(getUnreadCountForConversation).mockResolvedValue(0);

    const status = await getConversationStatus(APP_ID, EMPLOYER_ID);

    expect(status).toEqual({ exists: true, readOnly: false, unreadCount: 0 });
  });

  it("returns exists=false, unreadCount=0 when no conversation", async () => {
    vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(null);

    const status = await getConversationStatus(APP_ID, EMPLOYER_ID);

    expect(status.exists).toBe(false);
    expect(status.unreadCount).toBe(0);
  });

  it("returns readOnly=true when application is terminal", async () => {
    mockDb.execute.mockResolvedValue([{ ...mockAppRow, status: "rejected" }]);
    vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(mockConvWithMembers);

    const status = await getConversationStatus(APP_ID, EMPLOYER_ID);

    expect(status.readOnly).toBe(true);
  });

  it("returns 404 for non-participant", async () => {
    await expect(getConversationStatus(APP_ID, "non-participant-id")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("returns 404 when application does not exist", async () => {
    mockDb.execute.mockResolvedValue([]);

    await expect(getConversationStatus(APP_ID, EMPLOYER_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("allows seeker to check status", async () => {
    vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(mockConvWithMembers);

    const status = await getConversationStatus(APP_ID, SEEKER_ID);

    expect(status.exists).toBe(true);
    expect(status.readOnly).toBe(false);
  });

  it("returns unreadCount from getUnreadCountForConversation when conversation exists", async () => {
    vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(mockConvWithMembers);
    vi.mocked(getUnreadCountForConversation).mockResolvedValue(3);

    const status = await getConversationStatus(APP_ID, EMPLOYER_ID);

    expect(status.unreadCount).toBe(3);
    expect(getUnreadCountForConversation).toHaveBeenCalledWith(CONV_ID, EMPLOYER_ID);
  });

  it("does not call getUnreadCountForConversation when no conversation exists", async () => {
    vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(null);

    await getConversationStatus(APP_ID, EMPLOYER_ID);

    expect(getUnreadCountForConversation).not.toHaveBeenCalled();
  });
});

// ── sendMessage — with attachments (new conversation) ────────────────────────

describe("sendMessage — with attachments (new conversation)", () => {
  beforeEach(() => {
    vi.mocked(getFileUploadById).mockResolvedValue(mockFileUpload);
    mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      vi.mocked(createPortalConversation).mockResolvedValue(mockConversation);
      vi.mocked(createMessage).mockResolvedValue(mockMessage);
      vi.mocked(createMessageAttachments).mockResolvedValue([mockAttachment]);
      return cb({});
    });
  });

  it("creates message with attachments atomically in transaction", async () => {
    const result = await sendMessage({
      applicationId: APP_ID,
      senderId: EMPLOYER_ID,
      senderPortalRole: "EMPLOYER",
      content: "Please review my CV",
      attachmentFileUploadIds: [FILE_UPLOAD_ID],
    });

    expect(mockDb.transaction).toHaveBeenCalledOnce();
    expect(createMessageAttachments).toHaveBeenCalledWith(
      MSG_ID,
      expect.any(Array),
      expect.anything(),
    );
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]).toMatchObject({ id: ATTACHMENT_ID, fileName: "resume.pdf" });
  });

  it("EventBus payload includes attachments array", async () => {
    await sendMessage({
      applicationId: APP_ID,
      senderId: EMPLOYER_ID,
      senderPortalRole: "EMPLOYER",
      content: "Please review",
      attachmentFileUploadIds: [FILE_UPLOAD_ID],
    });

    expect(mockPortalEventBus.emit).toHaveBeenCalledWith(
      "portal.message.sent",
      expect.objectContaining({
        attachments: expect.arrayContaining([expect.objectContaining({ id: ATTACHMENT_ID })]),
      }),
    );
  });

  it("returns empty attachments array when no attachmentFileUploadIds", async () => {
    mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      vi.mocked(createPortalConversation).mockResolvedValue(mockConversation);
      vi.mocked(createMessage).mockResolvedValue(mockMessage);
      return cb({});
    });

    const result = await sendMessage({
      applicationId: APP_ID,
      senderId: EMPLOYER_ID,
      senderPortalRole: "EMPLOYER",
      content: "Hello!",
    });

    expect(result.attachments).toEqual([]);
    expect(createMessageAttachments).not.toHaveBeenCalled();
  });
});

// ── sendMessage — with attachments (existing conversation) ────────────────────

describe("sendMessage — with attachments (existing conversation)", () => {
  beforeEach(() => {
    vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(mockConvWithMembers);
    vi.mocked(getFileUploadById).mockResolvedValue(mockFileUpload);
    mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      vi.mocked(createMessage).mockResolvedValue(mockMessage);
      vi.mocked(createMessageAttachments).mockResolvedValue([mockAttachment]);
      return cb({});
    });
  });

  it("inserts message + attachments in transaction for existing conversation", async () => {
    const result = await sendMessage({
      applicationId: APP_ID,
      senderId: EMPLOYER_ID,
      senderPortalRole: "EMPLOYER",
      content: "Attached docs",
      attachmentFileUploadIds: [FILE_UPLOAD_ID],
    });

    expect(mockDb.transaction).toHaveBeenCalledOnce();
    expect(createMessageAttachments).toHaveBeenCalledWith(
      MSG_ID,
      expect.any(Array),
      expect.anything(),
    );
    expect(result.attachments).toHaveLength(1);
    expect(result.conversationCreated).toBe(false);
  });
});

// ── sendMessage — attachment validation ──────────────────────────────────────

describe("sendMessage — attachment validation", () => {
  it("rejects with 400 when more than 3 attachments provided", async () => {
    await expect(
      sendMessage({
        applicationId: APP_ID,
        senderId: EMPLOYER_ID,
        senderPortalRole: "EMPLOYER",
        content: "Hello",
        attachmentFileUploadIds: ["id1", "id2", "id3", "id4"],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects with 400 when file upload not found", async () => {
    vi.mocked(getFileUploadById).mockResolvedValue(null);

    await expect(
      sendMessage({
        applicationId: APP_ID,
        senderId: EMPLOYER_ID,
        senderPortalRole: "EMPLOYER",
        content: "Hello",
        attachmentFileUploadIds: [FILE_UPLOAD_ID],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects with 400 when upload does not belong to sender", async () => {
    vi.mocked(getFileUploadById).mockResolvedValue({
      ...mockFileUpload,
      uploaderId: "different-user-id",
    });

    await expect(
      sendMessage({
        applicationId: APP_ID,
        senderId: EMPLOYER_ID,
        senderPortalRole: "EMPLOYER",
        content: "Hello",
        attachmentFileUploadIds: [FILE_UPLOAD_ID],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects with 400 when upload status is not ready", async () => {
    vi.mocked(getFileUploadById).mockResolvedValue({
      ...mockFileUpload,
      status: "processing" as const,
    });

    await expect(
      sendMessage({
        applicationId: APP_ID,
        senderId: EMPLOYER_ID,
        senderPortalRole: "EMPLOYER",
        content: "Hello",
        attachmentFileUploadIds: [FILE_UPLOAD_ID],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("uses processedUrl when available, otherwise builds S3 URL", async () => {
    vi.mocked(getFileUploadById).mockResolvedValue({
      ...mockFileUpload,
      processedUrl: "https://cdn.example.com/processed.pdf",
    });
    mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      vi.mocked(createPortalConversation).mockResolvedValue(mockConversation);
      vi.mocked(createMessage).mockResolvedValue(mockMessage);
      vi.mocked(createMessageAttachments).mockResolvedValue([
        { ...mockAttachment, fileUrl: "https://cdn.example.com/processed.pdf" },
      ]);
      return cb({});
    });

    const result = await sendMessage({
      applicationId: APP_ID,
      senderId: EMPLOYER_ID,
      senderPortalRole: "EMPLOYER",
      content: "Hello",
      attachmentFileUploadIds: [FILE_UPLOAD_ID],
    });

    expect(buildS3PublicUrl).not.toHaveBeenCalled();
    expect(result.attachments[0]?.fileUrl).toBe("https://cdn.example.com/processed.pdf");
  });
});

// ── sendMessage — empty text with attachments ─────────────────────────────────

describe("sendMessage — empty text with attachments", () => {
  beforeEach(() => {
    vi.mocked(getFileUploadById).mockResolvedValue(mockFileUpload);
    mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      vi.mocked(createPortalConversation).mockResolvedValue(mockConversation);
      vi.mocked(createMessage).mockResolvedValue(mockMessage);
      vi.mocked(createMessageAttachments).mockResolvedValue([mockAttachment]);
      return cb({});
    });
  });

  it("succeeds when content is empty but attachments are provided", async () => {
    const result = await sendMessage({
      applicationId: APP_ID,
      senderId: EMPLOYER_ID,
      senderPortalRole: "EMPLOYER",
      content: "",
      attachmentFileUploadIds: [FILE_UPLOAD_ID],
    });

    expect(result.conversationId).toBe(CONV_ID);
    expect(result.attachments).toHaveLength(1);
  });

  it("succeeds when content is whitespace-only but attachments are provided", async () => {
    const result = await sendMessage({
      applicationId: APP_ID,
      senderId: EMPLOYER_ID,
      senderPortalRole: "EMPLOYER",
      content: "   ",
      attachmentFileUploadIds: [FILE_UPLOAD_ID],
    });

    expect(result.conversationId).toBe(CONV_ID);
  });

  it("rejects with 400 when both content and attachments are empty", async () => {
    await expect(
      sendMessage({
        applicationId: APP_ID,
        senderId: EMPLOYER_ID,
        senderPortalRole: "EMPLOYER",
        content: "",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

// ── getPortalConversationMessages — with attachments ─────────────────────────

describe("getPortalConversationMessages — with attachments", () => {
  beforeEach(() => {
    vi.mocked(getPortalConversationByApplicationId).mockResolvedValue(mockConvWithMembers);
    vi.mocked(isConversationMember).mockResolvedValue(true);
  });

  it("returns messages with _attachments populated from batch load", async () => {
    vi.mocked(getConversationMessages).mockResolvedValue({
      messages: [mockMessage],
      hasMore: false,
    });
    vi.mocked(getAttachmentsForMessages).mockResolvedValue([mockAttachment]);

    const result = await getPortalConversationMessages(APP_ID, EMPLOYER_ID);

    expect(getAttachmentsForMessages).toHaveBeenCalledWith([MSG_ID]);
    expect(result.messages[0]?._attachments).toHaveLength(1);
    expect(result.messages[0]?._attachments?.[0]).toMatchObject({
      id: ATTACHMENT_ID,
      fileName: "resume.pdf",
      fileType: "application/pdf",
    });
  });

  it("returns messages with empty _attachments when no attachments exist", async () => {
    vi.mocked(getConversationMessages).mockResolvedValue({
      messages: [mockMessage],
      hasMore: false,
    });
    vi.mocked(getAttachmentsForMessages).mockResolvedValue([]);

    const result = await getPortalConversationMessages(APP_ID, EMPLOYER_ID);

    expect(result.messages[0]?._attachments).toEqual([]);
  });

  it("groups attachments by messageId correctly", async () => {
    const MSG_ID_2 = "00000000-0000-4000-8000-000000000020";
    const ATTACHMENT_ID_2 = "00000000-0000-4000-8000-000000000021";
    const mockMessage2 = { ...mockMessage, id: MSG_ID_2 };
    const mockAttachment2 = {
      ...mockAttachment,
      id: ATTACHMENT_ID_2,
      messageId: MSG_ID_2,
      fileName: "portfolio.pdf",
    };

    vi.mocked(getConversationMessages).mockResolvedValue({
      messages: [mockMessage, mockMessage2],
      hasMore: false,
    });
    vi.mocked(getAttachmentsForMessages).mockResolvedValue([mockAttachment, mockAttachment2]);

    const result = await getPortalConversationMessages(APP_ID, EMPLOYER_ID);

    expect(result.messages[0]?._attachments).toHaveLength(1);
    expect(result.messages[0]?._attachments?.[0]?.id).toBe(ATTACHMENT_ID);
    expect(result.messages[1]?._attachments).toHaveLength(1);
    expect(result.messages[1]?._attachments?.[0]?.id).toBe(ATTACHMENT_ID_2);
  });

  it("skips batch load when no messages returned", async () => {
    vi.mocked(getConversationMessages).mockResolvedValue({ messages: [], hasMore: false });

    const result = await getPortalConversationMessages(APP_ID, EMPLOYER_ID);

    expect(getAttachmentsForMessages).not.toHaveBeenCalled();
    expect(result.messages).toEqual([]);
  });
});
