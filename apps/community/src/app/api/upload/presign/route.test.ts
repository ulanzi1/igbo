// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRequireAuthenticatedSession = vi.fn();
const mockGeneratePresignedUploadUrl = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/file-upload-service", () => ({
  generatePresignedUploadUrl: (...args: unknown[]) => mockGeneratePresignedUploadUrl(...args),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    FILE_UPLOAD_PRESIGN: { maxRequests: 20, windowMs: 3_600_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 19,
    resetAt: Date.now() + 3_600_000,
    limit: 20,
  }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({
    "X-RateLimit-Limit": "20",
    "X-RateLimit-Remaining": "19",
    "X-RateLimit-Reset": "9999999999",
  }),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { POST } from "./route";

const USER_ID = "user-abc-123";

function makePostRequest(body: unknown) {
  return new Request("https://example.com/api/upload/presign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: "example.com",
      Origin: "https://example.com",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockGeneratePresignedUploadUrl.mockResolvedValue({
    uploadUrl: "https://presigned.example.com/upload",
    objectKey: `uploads/${USER_ID}/uuid-photo.jpg`,
    fileUploadId: "upload-record-id",
  });
});

describe("POST /api/upload/presign", () => {
  it("returns 200 with { data: { uploadUrl, objectKey, fileUploadId } } for valid authenticated request", async () => {
    const req = makePostRequest({
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024 * 1024,
      category: "image",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({
      uploadUrl: "https://presigned.example.com/upload",
      fileUploadId: "upload-record-id",
    });
    expect(body.data.objectKey).toContain("uploads/");
  });

  it("returns 400 for disallowed MIME type (service rejects)", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockGeneratePresignedUploadUrl.mockRejectedValue(
      new ApiError({ title: "Bad Request", status: 400, detail: "File type not allowed" }),
    );

    const req = makePostRequest({
      filename: "virus.exe",
      mimeType: "application/x-msdownload",
      sizeBytes: 1024,
      category: "document",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for oversized file (service rejects)", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockGeneratePresignedUploadUrl.mockRejectedValue(
      new ApiError({ title: "Bad Request", status: 400, detail: "File size exceeds limit" }),
    );

    const req = makePostRequest({
      filename: "big-video.mp4",
      mimeType: "video/mp4",
      sizeBytes: 200 * 1024 * 1024, // 200MB > 100MB limit
      category: "video",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid category", async () => {
    const req = makePostRequest({
      filename: "file.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      category: "invalid_category",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing required fields", async () => {
    const req = makePostRequest({ filename: "file.jpg" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 for unauthenticated request", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );

    const req = makePostRequest({
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      category: "image",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 429 with X-RateLimit-* headers on rate limit exceeded", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limiter");
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 3_600_000,
      limit: 20,
    });

    const req = makePostRequest({
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      category: "image",
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toMatchObject({
      title: "Too Many Requests",
      status: 429,
    });
  });
});
