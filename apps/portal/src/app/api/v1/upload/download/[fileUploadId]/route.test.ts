// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/file-uploads", () => ({ getFileUploadById: vi.fn() }));
vi.mock("@igbo/db/queries/chat-message-attachments", () => ({
  getAttachmentByFileUploadId: vi.fn(),
}));
vi.mock("@igbo/db/queries/chat-messages", () => ({ getMessageById: vi.fn() }));
vi.mock("@igbo/db/queries/chat-conversations", () => ({ isConversationMember: vi.fn() }));

const mockGetSignedUrl = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: mockGetSignedUrl }));

const mockGetObjectCommandInstances: unknown[] = [];
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class MockS3Client {
    send = vi.fn();
  },
  GetObjectCommand: class MockGetObjectCommand {
    constructor(public params: unknown) {
      mockGetObjectCommandInstances.push(params);
    }
  },
}));

vi.mock("@/lib/s3-client", () => ({
  getPortalS3Client: vi.fn(() => ({})),
}));

import { auth } from "@igbo/auth";
import { getFileUploadById } from "@igbo/db/queries/file-uploads";
import { getAttachmentByFileUploadId } from "@igbo/db/queries/chat-message-attachments";
import { getMessageById } from "@igbo/db/queries/chat-messages";
import { isConversationMember } from "@igbo/db/queries/chat-conversations";
import { GET } from "./route";

// ── Constants ────────────────────────────────────────────────────────────────

const FILE_UPLOAD_ID = "00000000-0000-4000-8000-000000000001";
const ATTACHMENT_ID = "00000000-0000-4000-8000-000000000002";
const MSG_ID = "00000000-0000-4000-8000-000000000003";
const CONV_ID = "00000000-0000-4000-8000-000000000004";
const USER_ID = "00000000-0000-4000-8000-000000000005";
const SIGNED_URL = "https://test-bucket.example.com/signed-url?token=abc";

const mockSession = { user: { id: USER_ID, activePortalRole: "EMPLOYER" } };

const mockUpload = {
  id: FILE_UPLOAD_ID,
  uploaderId: USER_ID,
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
  fileUrl: "https://test-bucket.example.com/portal/messages/user-123/uuid.pdf",
  fileName: "resume.pdf",
  fileType: "application/pdf",
  fileSize: 12345,
  createdAt: new Date(),
};

const mockMessage = {
  id: MSG_ID,
  conversationId: CONV_ID,
  senderId: USER_ID,
  content: "Here is my CV",
  contentType: "text" as const,
  parentMessageId: null,
  editedAt: null,
  deletedAt: null,
  createdAt: new Date(),
};

function makeRequest(fileUploadId = FILE_UPLOAD_ID): Request {
  return new Request(`https://jobs.igbo.com/api/v1/upload/download/${fileUploadId}`, {
    method: "GET",
    headers: { Origin: "https://jobs.igbo.com", Host: "jobs.igbo.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetObjectCommandInstances.length = 0;
  vi.mocked(auth).mockResolvedValue(
    mockSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
  vi.mocked(getFileUploadById).mockResolvedValue(mockUpload);
  vi.mocked(getAttachmentByFileUploadId).mockResolvedValue(mockAttachment);
  vi.mocked(getMessageById).mockResolvedValue(mockMessage);
  vi.mocked(isConversationMember).mockResolvedValue(true);
  mockGetSignedUrl.mockResolvedValue(SIGNED_URL);
  process.env.HETZNER_S3_BUCKET = "test-bucket";
  process.env.HETZNER_S3_REGION = "eu-central";
  process.env.HETZNER_S3_ACCESS_KEY_ID = "test-key";
  process.env.HETZNER_S3_SECRET_ACCESS_KEY = "test-secret";
});

// ── Auth ─────────────────────────────────────────────────────────────────────

describe("GET /api/v1/upload/download/[fileUploadId] — auth", () => {
  it("returns 401 for unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });
});

// ── Input validation ──────────────────────────────────────────────────────────

describe("GET /api/v1/upload/download/[fileUploadId] — validation", () => {
  it("returns 400 for non-UUID fileUploadId", async () => {
    const res = await GET(makeRequest("not-a-uuid"));
    expect(res.status).toBe(400);
  });
});

// ── Not found cases ───────────────────────────────────────────────────────────

describe("GET /api/v1/upload/download/[fileUploadId] — not found", () => {
  it("returns 404 when file upload does not exist", async () => {
    vi.mocked(getFileUploadById).mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });

  it("returns 404 when attachment record not found", async () => {
    vi.mocked(getAttachmentByFileUploadId).mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });

  it("returns 404 when message not found", async () => {
    vi.mocked(getMessageById).mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });

  it("returns 404 (not 403) when user is not a conversation participant", async () => {
    vi.mocked(isConversationMember).mockResolvedValue(false);
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });
});

// ── Happy path ────────────────────────────────────────────────────────────────

describe("GET /api/v1/upload/download/[fileUploadId] — success", () => {
  it("redirects to signed URL on success", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(SIGNED_URL);
  });

  it("calls getSignedUrl with correct bucket and key", async () => {
    await GET(makeRequest());
    expect(mockGetObjectCommandInstances[0]).toMatchObject({
      Bucket: "test-bucket",
      Key: "portal/messages/user-123/uuid.pdf",
    });
  });

  it("calls isConversationMember with the right conversationId and userId", async () => {
    await GET(makeRequest());
    expect(isConversationMember).toHaveBeenCalledWith(CONV_ID, USER_ID, "portal");
  });

  it("generates signed URL with 5-minute expiry", async () => {
    await GET(makeRequest());
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ expiresIn: 300 }),
    );
  });
});

// ── S3 error handling ─────────────────────────────────────────────────────────

describe("GET /api/v1/upload/download/[fileUploadId] — S3 error", () => {
  it("returns 500 when getSignedUrl throws", async () => {
    mockGetSignedUrl.mockRejectedValueOnce(new Error("S3 service unavailable"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});

// ── Status guard ──────────────────────────────────────────────────────────────

describe("GET /api/v1/upload/download/[fileUploadId] — status guard", () => {
  it("returns 404 when upload status is quarantined", async () => {
    vi.mocked(getFileUploadById).mockResolvedValue({
      ...mockUpload,
      status: "quarantined" as const,
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });

  it("returns 404 when upload status is deleted", async () => {
    vi.mocked(getFileUploadById).mockResolvedValue({ ...mockUpload, status: "deleted" as const });
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });
});
