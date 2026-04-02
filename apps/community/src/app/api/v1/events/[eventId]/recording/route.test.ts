// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockGetRecordingPlaybackUrl = vi.fn();

vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/event-service", () => ({
  getRecordingPlaybackUrl: (...args: unknown[]) => mockGetRecordingPlaybackUrl(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    EVENT_DETAIL: { maxRequests: 60, windowMs: 60000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET } from "./route";
import { ApiError } from "@/lib/api-error";

const makeRequest = () =>
  new Request("https://localhost:3000/api/v1/events/event-1/recording", { method: "GET" });

describe("GET /api/v1/events/[eventId]/recording", () => {
  beforeEach(() => {
    mockRequireAuthenticatedSession.mockReset();
    mockGetRecordingPlaybackUrl.mockReset();

    mockRequireAuthenticatedSession.mockResolvedValue({ userId: "user-1", role: "MEMBER" });
  });

  it("returns 200 with recording metadata", async () => {
    mockGetRecordingPlaybackUrl.mockResolvedValue({
      url: "https://storage.example.com/rec.mp4",
      status: "ready",
      expiresAt: new Date("2026-06-01"),
      sizeBytes: 100_000_000,
      isPreserved: false,
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { url: string; status: string } };
    expect(body.data.url).toBe("https://storage.example.com/rec.mp4");
    expect(body.data.status).toBe("ready");
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not Top-tier", async () => {
    mockGetRecordingPlaybackUrl.mockRejectedValue(
      new ApiError({ title: "Top-tier only", status: 403 }),
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 404 when event not found", async () => {
    mockGetRecordingPlaybackUrl.mockRejectedValue(
      new ApiError({ title: "Event not found", status: 404 }),
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });
});
