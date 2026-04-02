// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockPreserveRecording = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/event-service", () => ({
  preserveRecording: (...args: unknown[]) => mockPreserveRecording(...args),
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
  new Request("https://localhost:3000/api/v1/events/event-1/recording/preserve", {
    method: "POST",
    headers: CSRF_HEADERS,
  });

describe("POST /api/v1/events/[eventId]/recording/preserve", () => {
  beforeEach(() => {
    mockRequireAuthenticatedSession.mockReset();
    mockPreserveRecording.mockReset();

    mockRequireAuthenticatedSession.mockResolvedValue({ userId: "user-1", role: "MEMBER" });
    mockPreserveRecording.mockResolvedValue(undefined);
  });

  it("returns 200 with preserved:true on success", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { preserved: boolean } };
    expect(body.data.preserved).toBe(true);
    expect(mockPreserveRecording).toHaveBeenCalledWith("user-1", "event-1");
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not the event creator", async () => {
    mockPreserveRecording.mockRejectedValue(
      new ApiError({
        title: "Only the event creator or an admin can preserve recordings",
        status: 403,
      }),
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 422 when quota is exceeded", async () => {
    mockPreserveRecording.mockRejectedValue(
      new ApiError({ title: "Events.recordings.quotaReached", status: 422 }),
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(422);
  });
});
