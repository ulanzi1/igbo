// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@/services/conversation-service", () => ({
  sendMessage: vi.fn(),
  getPortalConversationMessages: vi.fn(),
}));
vi.mock("zod/v4", async (importOriginal) => {
  // Use real zod/v4 for schema validation
  const actual = await importOriginal<typeof import("zod/v4")>();
  return actual;
});

import { auth } from "@igbo/auth";
import * as conversationService from "@/services/conversation-service";
import { POST, GET } from "./route";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";

const APP_ID = "00000000-0000-4000-8000-000000000001";
const CONV_ID = "00000000-0000-4000-8000-000000000002";
const MSG_ID = "00000000-0000-4000-8000-000000000003";

const employerSession = {
  user: { id: "employer-1", activePortalRole: "EMPLOYER" },
};

const mockMessage = {
  id: MSG_ID,
  conversationId: CONV_ID,
  senderId: "employer-1",
  content: "Hello!",
  contentType: "text",
  parentMessageId: null,
  editedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-01-01T12:00:00Z"),
};

function makePostRequest(
  appId: string,
  body: unknown = { content: "Hello!" },
  options: { headers?: Record<string, string> } = {},
): Request {
  return new Request(`https://jobs.igbo.com/api/v1/conversations/${appId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
      ...options.headers,
    },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(appId: string, params: Record<string, string> = {}): Request {
  const url = new URL(`https://jobs.igbo.com/api/v1/conversations/${appId}/messages`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString(), {
    method: "GET",
    headers: {
      Host: "jobs.igbo.com",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
  vi.mocked(conversationService.sendMessage).mockResolvedValue({
    conversationId: CONV_ID,
    message: mockMessage as never,
    conversationCreated: true,
    attachments: [],
  });
  vi.mocked(conversationService.getPortalConversationMessages).mockResolvedValue({
    messages: [mockMessage as never],
    hasMore: false,
  });
});

// ── POST ────────────────────────────────────────────────────────────────────

describe("POST /api/v1/conversations/[applicationId]/messages", () => {
  it("returns 201 on successful send", async () => {
    const res = await POST(makePostRequest(APP_ID));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.conversationId).toBe(CONV_ID);
  });

  it("returns 401 without auth", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(makePostRequest(APP_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 when content is missing", async () => {
    const res = await POST(makePostRequest(APP_ID, {}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is empty string", async () => {
    // Zod min(1) rejects empty — but service also checks trimmed length; zod is first
    const res = await POST(makePostRequest(APP_ID, { content: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when content exceeds 5000 characters", async () => {
    const res = await POST(makePostRequest(APP_ID, { content: "a".repeat(5001) }));
    expect(res.status).toBe(400);
  });

  it("returns 403 on CONVERSATION_READ_ONLY", async () => {
    vi.mocked(conversationService.sendMessage).mockRejectedValue(
      new ApiError({
        title: "Forbidden",
        status: 403,
        detail: PORTAL_ERRORS.CONVERSATION_READ_ONLY,
      }),
    );
    const res = await POST(makePostRequest(APP_ID));
    expect(res.status).toBe(403);
  });

  it("returns 403 on SEEKER_CANNOT_INITIATE", async () => {
    vi.mocked(conversationService.sendMessage).mockRejectedValue(
      new ApiError({
        title: "Forbidden",
        status: 403,
        detail: PORTAL_ERRORS.SEEKER_CANNOT_INITIATE,
      }),
    );
    const res = await POST(makePostRequest(APP_ID));
    expect(res.status).toBe(403);
  });

  it("returns 404 on non-existent application", async () => {
    vi.mocked(conversationService.sendMessage).mockRejectedValue(
      new ApiError({ title: "Not Found", status: 404 }),
    );
    const res = await POST(makePostRequest(APP_ID));
    expect(res.status).toBe(404);
  });

  it("passes parsed body fields to sendMessage", async () => {
    await POST(
      makePostRequest(APP_ID, {
        content: "Hello!",
        contentType: "text",
        parentMessageId: null,
      }),
    );
    expect(conversationService.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: APP_ID,
        content: "Hello!",
        contentType: "text",
      }),
    );
  });
});

// ── GET ─────────────────────────────────────────────────────────────────────

describe("GET /api/v1/conversations/[applicationId]/messages", () => {
  it("returns 200 with messages", async () => {
    const res = await GET(makeGetRequest(APP_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.messages).toHaveLength(1);
  });

  it("returns 401 without auth", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET(makeGetRequest(APP_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-participant", async () => {
    vi.mocked(conversationService.getPortalConversationMessages).mockRejectedValue(
      new ApiError({ title: "Not Found", status: 404 }),
    );
    const res = await GET(makeGetRequest(APP_ID));
    expect(res.status).toBe(404);
  });

  it("passes cursor and limit to service", async () => {
    await GET(makeGetRequest(APP_ID, { cursor: "some-cursor", limit: "10" }));
    expect(conversationService.getPortalConversationMessages).toHaveBeenCalledWith(
      APP_ID,
      "employer-1",
      expect.objectContaining({ cursor: "some-cursor", limit: 10 }),
    );
  });

  it("returns 400 for non-UUID applicationId", async () => {
    const res = await GET(makeGetRequest("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid limit (NaN)", async () => {
    const res = await GET(makeGetRequest(APP_ID, { limit: "abc" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for negative limit", async () => {
    const res = await GET(makeGetRequest(APP_ID, { limit: "-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for zero limit", async () => {
    const res = await GET(makeGetRequest(APP_ID, { limit: "0" }));
    expect(res.status).toBe(400);
  });
});

// ── POST validation ─────────────────────────────────────────────────────────

describe("POST /api/v1/conversations/[applicationId]/messages — input validation", () => {
  it("returns 400 for non-UUID applicationId", async () => {
    const res = await POST(makePostRequest("not-a-uuid"));
    expect(res.status).toBe(400);
  });
});

// ── POST — attachments ───────────────────────────────────────────────────────

describe("POST /api/v1/conversations/[applicationId]/messages — attachments", () => {
  const FILE_UPLOAD_ID = "00000000-0000-4000-8000-000000000010";
  const ATTACHMENT_ID = "00000000-0000-4000-8000-000000000011";

  const mockAttachment = {
    id: ATTACHMENT_ID,
    fileUrl: "https://test-bucket.example.com/portal/messages/employer-1/uuid.pdf",
    fileName: "resume.pdf",
    fileType: "application/pdf",
    fileSize: 12345,
  };

  it("passes attachmentFileUploadIds to sendMessage service", async () => {
    await POST(
      makePostRequest(APP_ID, {
        content: "Here is my CV",
        attachmentFileUploadIds: [FILE_UPLOAD_ID],
      }),
    );
    expect(conversationService.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentFileUploadIds: [FILE_UPLOAD_ID],
      }),
    );
  });

  it("returns attachments array in response body", async () => {
    vi.mocked(conversationService.sendMessage).mockResolvedValue({
      conversationId: CONV_ID,
      message: mockMessage as never,
      conversationCreated: false,
      attachments: [mockAttachment],
    });

    const res = await POST(
      makePostRequest(APP_ID, {
        content: "Here is my CV",
        attachmentFileUploadIds: [FILE_UPLOAD_ID],
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.attachments).toHaveLength(1);
    expect(body.data.attachments[0]).toMatchObject({ id: ATTACHMENT_ID, fileName: "resume.pdf" });
  });

  it("succeeds with empty content when attachments are provided", async () => {
    const res = await POST(
      makePostRequest(APP_ID, {
        content: "",
        attachmentFileUploadIds: [FILE_UPLOAD_ID],
      }),
    );
    expect(res.status).toBe(201);
  });

  it("returns 400 when both content and attachments are missing", async () => {
    const res = await POST(makePostRequest(APP_ID, {}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is empty and no attachments", async () => {
    const res = await POST(makePostRequest(APP_ID, { content: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when attachmentFileUploadIds has more than 3 items", async () => {
    const res = await POST(
      makePostRequest(APP_ID, {
        content: "Hello",
        attachmentFileUploadIds: ["id1", "id2", "id3", "id4"],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when attachmentFileUploadIds contains non-UUID", async () => {
    const res = await POST(
      makePostRequest(APP_ID, {
        content: "Hello",
        attachmentFileUploadIds: ["not-a-uuid"],
      }),
    );
    expect(res.status).toBe(400);
  });
});
