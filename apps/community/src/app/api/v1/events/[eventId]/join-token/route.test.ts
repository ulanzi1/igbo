// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/server/api/middleware", () => ({
  withApiHandler: (handler: (req: Request) => Promise<Response>, _opts?: unknown) => handler,
}));

vi.mock("@/lib/api-response", () => ({
  successResponse: vi.fn(
    (data: unknown, _meta?: unknown, status = 200) =>
      new Response(JSON.stringify({ data }), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  ),
  errorResponse: vi.fn(
    (problem: { status?: number; title: string }) =>
      new Response(JSON.stringify({ title: problem.title }), { status: problem.status ?? 500 }),
  ),
}));

vi.mock("@/lib/api-error", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor({ title, status }: { title: string; status: number }) {
      super(title);
      this.status = status;
    }
  },
}));

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", role: "MEMBER" }),
}));

vi.mock("@/services/event-service", () => ({
  getJoinToken: vi.fn(),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    EVENT_RSVP: { maxRequests: 10, windowMs: 60000 },
  },
  applyRateLimit: vi.fn().mockResolvedValue({ success: true }),
}));

import { requireAuthenticatedSession } from "@/services/permissions";
import { getJoinToken } from "@/services/event-service";

const makeRequest = () =>
  new Request("http://localhost/api/v1/events/event-1/join-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: "localhost:3000",
      Origin: "https://localhost:3000",
    },
  });

describe("POST /api/v1/events/[eventId]/join-token", () => {
  beforeEach(() => {
    vi.mocked(requireAuthenticatedSession).mockReset();
    vi.mocked(getJoinToken).mockReset();
    vi.mocked(requireAuthenticatedSession).mockResolvedValue({ userId: "user-1", role: "MEMBER" });
  });

  it("returns 200 with token and roomUrl on success", async () => {
    vi.mocked(getJoinToken).mockResolvedValue({
      token: "daily-jwt-token",
      roomUrl: "https://igbo.daily.co/igbo-evt-abc",
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { token: string; roomUrl: string } };
    expect(body.data.token).toBe("daily-jwt-token");
    expect(body.data.roomUrl).toBe("https://igbo.daily.co/igbo-evt-abc");
  });

  it("returns 401 when unauthenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(requireAuthenticatedSession).mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const { POST } = await import("./route");
    await expect(POST(makeRequest())).rejects.toMatchObject({ status: 401 });
  });

  it("returns 403 when user has no RSVP", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(getJoinToken).mockRejectedValue(
      new ApiError({ title: "You must be registered to join this event", status: 403 }),
    );
    const { POST } = await import("./route");
    await expect(POST(makeRequest())).rejects.toMatchObject({ status: 403 });
  });

  it("returns 403 when event is cancelled", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(getJoinToken).mockRejectedValue(
      new ApiError({ title: "Event is cancelled", status: 403 }),
    );
    const { POST } = await import("./route");
    await expect(POST(makeRequest())).rejects.toMatchObject({ status: 403 });
  });

  it("returns 404 when event not found", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(getJoinToken).mockRejectedValue(
      new ApiError({ title: "Event not found", status: 404 }),
    );
    const { POST } = await import("./route");
    await expect(POST(makeRequest())).rejects.toMatchObject({ status: 404 });
  });
});
