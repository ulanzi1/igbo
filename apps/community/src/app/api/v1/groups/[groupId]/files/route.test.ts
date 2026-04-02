// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockGetGroupMember = vi.fn();
const mockListGroupFiles = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@igbo/db/queries/groups", () => ({
  getGroupMember: (...args: unknown[]) => mockGetGroupMember(...args),
}));

vi.mock("@igbo/db/queries/group-channels", () => ({
  listGroupFiles: (...args: unknown[]) => mockListGroupFiles(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    GROUP_DETAIL: { maxRequests: 60, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000, limit: 10 }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET } from "./route";
import { ApiError } from "@/lib/api-error";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const GROUP_ID = "00000000-0000-4000-8000-000000000002";
const BASE_URL = `https://localhost:3000/api/v1/groups/${GROUP_ID}/files`;

const UPLOADED_AT = new Date("2025-03-01T00:00:00.000Z");

const MOCK_FILES = [
  {
    id: "00000000-0000-4000-8000-000000000010",
    fileName: "document.pdf",
    fileUrl: "https://s3.example.com/document.pdf",
    fileType: "application/pdf",
    fileSize: 12345,
    uploadedAt: UPLOADED_AT,
    uploaderName: "Alice",
    messageId: "00000000-0000-4000-8000-000000000011",
    conversationId: "00000000-0000-4000-8000-000000000012",
  },
];

beforeEach(() => {
  mockRequireAuthenticatedSession.mockReset();
  mockGetGroupMember.mockReset();
  mockListGroupFiles.mockReset();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
});

describe("GET /api/v1/groups/[groupId]/files", () => {
  it("returns 200 with files for active member", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });
    mockListGroupFiles.mockResolvedValue(MOCK_FILES);

    const req = new Request(BASE_URL);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.files).toHaveLength(1);
    expect(body.data.files[0]).toEqual({
      id: MOCK_FILES[0]!.id,
      fileName: "document.pdf",
      fileUrl: "https://s3.example.com/document.pdf",
      fileType: "application/pdf",
      fileSize: 12345,
      uploadedAt: UPLOADED_AT.toISOString(),
      uploaderName: "Alice",
      messageId: MOCK_FILES[0]!.messageId,
      conversationId: MOCK_FILES[0]!.conversationId,
    });
  });

  it("returns null nextCursor when partial page returned", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });
    mockListGroupFiles.mockResolvedValue(MOCK_FILES); // only 1, less than 50

    const req = new Request(BASE_URL);
    const res = await GET(req);

    const body = await res.json();
    expect(body.data.nextCursor).toBeNull();
  });

  it("returns 403 for non-member", async () => {
    mockGetGroupMember.mockResolvedValue(null);

    const req = new Request(BASE_URL);
    const res = await GET(req);

    expect(res.status).toBe(403);
  });

  it("returns 403 for pending member", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "pending" });

    const req = new Request(BASE_URL);
    const res = await GET(req);

    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ status: 401, title: "Unauthorized" }),
    );

    const req = new Request(BASE_URL);
    const res = await GET(req);

    expect(res.status).toBe(401);
  });
});
