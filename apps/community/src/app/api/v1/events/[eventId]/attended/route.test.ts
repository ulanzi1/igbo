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
  requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "host-1", role: "MEMBER" }),
}));

vi.mock("@/services/event-service", () => ({
  markAttendance: vi.fn(),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    EVENT_RSVP: { maxRequests: 10, windowMs: 60000 },
  },
  applyRateLimit: vi.fn().mockResolvedValue({ success: true }),
}));

import { requireAuthenticatedSession } from "@/services/permissions";
import { markAttendance } from "@/services/event-service";

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/v1/events/event-1/attended", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: "localhost:3000",
      Origin: "https://localhost:3000",
    },
    body: JSON.stringify(body),
  });

describe("POST /api/v1/events/[eventId]/attended", () => {
  beforeEach(() => {
    vi.mocked(requireAuthenticatedSession).mockReset();
    vi.mocked(markAttendance).mockReset();
    vi.mocked(requireAuthenticatedSession).mockResolvedValue({ userId: "host-1", role: "MEMBER" });
    vi.mocked(markAttendance).mockResolvedValue(undefined);
  });

  it("returns 200 for video source (self-mark)", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ source: "video" }));
    expect(res.status).toBe(200);
    expect(markAttendance).toHaveBeenCalledWith("host-1", "event-1", "video");
  });

  it("returns 200 for manual source (host check-in)", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ source: "manual", userId: "00000000-0000-4000-8000-000000000099" }),
    );
    expect(res.status).toBe(200);
    expect(markAttendance).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000099",
      "event-1",
      "manual",
      "host-1",
    );
  });

  it("is idempotent — returns 200 even if already attended", async () => {
    vi.mocked(markAttendance).mockResolvedValue(undefined);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ source: "video" }));
    expect(res.status).toBe(200);
  });

  it("returns 422 for invalid request body", async () => {
    const { POST } = await import("./route");
    await expect(POST(makeRequest({ source: "unknown" }))).rejects.toMatchObject({ status: 422 });
  });

  it("returns 403 when non-creator attempts manual check-in", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(markAttendance).mockRejectedValue(
      new ApiError({ title: "Only the event creator can manually mark attendance", status: 403 }),
    );
    const { POST } = await import("./route");
    await expect(
      POST(makeRequest({ source: "manual", userId: "00000000-0000-4000-8000-000000000099" })),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("returns 401 when unauthenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(requireAuthenticatedSession).mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const { POST } = await import("./route");
    await expect(POST(makeRequest({ source: "video" }))).rejects.toMatchObject({ status: 401 });
  });
});
