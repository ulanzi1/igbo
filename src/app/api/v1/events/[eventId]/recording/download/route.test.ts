// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockGetRecordingDownloadUrl = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/event-service", () => ({
  getRecordingDownloadUrl: (...args: unknown[]) => mockGetRecordingDownloadUrl(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    EVENT_UPDATE: { maxRequests: 20, windowMs: 60000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { POST } from "./route";
import { ApiError } from "@/lib/api-error";

const CSRF_HEADERS = {
  Host: "localhost:3000",
  Origin: "https://localhost:3000",
};

const makeRequest = () =>
  new Request("https://localhost:3000/api/v1/events/event-1/recording/download", {
    method: "POST",
    headers: CSRF_HEADERS,
  });

describe("POST /api/v1/events/[eventId]/recording/download", () => {
  beforeEach(() => {
    mockRequireAuthenticatedSession.mockReset();
    mockGetRecordingDownloadUrl.mockReset();

    mockRequireAuthenticatedSession.mockResolvedValue({ userId: "user-1", role: "MEMBER" });
  });

  it("returns 200 with presigned download URL", async () => {
    mockGetRecordingDownloadUrl.mockResolvedValue(
      "https://presigned.example.com/rec.mp4?X-Amz-Signature=abc",
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { downloadUrl: string } };
    expect(body.data.downloadUrl).toContain("presigned.example.com");
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not Top-tier", async () => {
    mockGetRecordingDownloadUrl.mockRejectedValue(
      new ApiError({ title: "Top-tier only", status: 403 }),
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 404 when no mirror URL available", async () => {
    mockGetRecordingDownloadUrl.mockRejectedValue(
      new ApiError({ title: "Recording not available for download", status: 404 }),
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
  });
});
