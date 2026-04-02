// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRequireAuthenticatedSession = vi.fn();
const mockConfirmUpload = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/file-upload-service", () => ({
  confirmUpload: (...args: unknown[]) => mockConfirmUpload(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

// Side-effect import in route — mock to prevent @/env + @/db from loading in tests
vi.mock("@/server/jobs/file-processing", () => ({}));

import { POST } from "./route";

const USER_ID = "user-abc-123";

function makePostRequest(body: unknown) {
  return new Request("https://example.com/api/upload/confirm", {
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
  mockConfirmUpload.mockResolvedValue(undefined);
});

describe("POST /api/upload/confirm", () => {
  it("returns 200 with message for valid authenticated request with owned objectKey", async () => {
    const req = makePostRequest({ objectKey: `uploads/${USER_ID}/uuid-photo.jpg` });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.message).toMatch(/processing/i);
    expect(mockConfirmUpload).toHaveBeenCalledWith(`uploads/${USER_ID}/uuid-photo.jpg`, USER_ID);
  });

  it("returns 404 for unknown objectKey", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockConfirmUpload.mockRejectedValue(
      new ApiError({ title: "Not Found", status: 404, detail: "Upload record not found" }),
    );

    const req = makePostRequest({ objectKey: "uploads/nonexistent/key.jpg" });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 403 for objectKey owned by different user", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockConfirmUpload.mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403, detail: "You do not own this upload" }),
    );

    const req = makePostRequest({ objectKey: "uploads/other-user/file.jpg" });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 401 for unauthenticated request", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );

    const req = makePostRequest({ objectKey: "uploads/user/file.jpg" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing objectKey", async () => {
    const req = makePostRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("https://example.com/api/upload/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Host: "example.com",
        Origin: "https://example.com",
      },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
