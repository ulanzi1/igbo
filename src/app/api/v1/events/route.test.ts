// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/server/api/middleware", () => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  withApiHandler: (handler: (req: Request) => Promise<Response>, opts?: unknown) => handler,
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
    (title: string, status = 500, detail?: string) =>
      new Response(JSON.stringify({ title, detail }), { status }),
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
  canCreateEvent: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/services/event-service", () => ({
  createEvent: vi.fn().mockResolvedValue({ eventId: "event-1" }),
  CreateEventSchema: {
    safeParse: vi.fn().mockReturnValue({
      success: true,
      data: {
        title: "Test Event",
        eventType: "general",
        format: "virtual",
        timezone: "UTC",
        startTime: new Date(Date.now() + 86400000).toISOString(),
        endTime: new Date(Date.now() + 90000000).toISOString(),
        recurrencePattern: "none",
      },
    }),
  },
  UpdateEventSchema: { safeParse: vi.fn() },
}));

vi.mock("@/db/queries/events", () => ({
  listUpcomingEvents: vi.fn().mockResolvedValue([]),
  createEvent: vi.fn(),
  getEventById: vi.fn(),
  updateEvent: vi.fn(),
  cancelEvent: vi.fn(),
  listGroupEvents: vi.fn(),
  getEventsByParentId: vi.fn(),
}));

vi.mock("@/server/auth/config", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: { EVENT_CREATE: { maxRequests: 5, windowMs: 3600000 } },
  applyRateLimit: vi.fn().mockResolvedValue({ success: true }),
}));

import { requireAuthenticatedSession } from "@/services/permissions";
import { createEvent } from "@/services/event-service";
import { listUpcomingEvents } from "@/db/queries/events";
import { CreateEventSchema } from "@/services/event-service";

const makeRequest = (method: string, body?: unknown) =>
  new Request("http://localhost/api/v1/events", {
    method,
    headers: {
      "Content-Type": "application/json",
      Host: "localhost:3000",
      Origin: "https://localhost:3000",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

describe("GET /api/v1/events", () => {
  beforeEach(() => {
    vi.mocked(listUpcomingEvents).mockReset();
    vi.mocked(listUpcomingEvents).mockResolvedValue([]);
  });

  it("returns 200 with event list (no auth needed)", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
  });

  it("returns 200 with empty array when no events", async () => {
    vi.mocked(listUpcomingEvents).mockResolvedValue([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest("GET"));
    const data = (await res.json()) as { data: { events: unknown[] } };
    expect(data.data.events).toHaveLength(0);
  });
});

describe("POST /api/v1/events", () => {
  beforeEach(() => {
    vi.mocked(requireAuthenticatedSession).mockReset();
    vi.mocked(createEvent).mockReset();
    vi.mocked(CreateEventSchema.safeParse).mockReset();

    vi.mocked(requireAuthenticatedSession).mockResolvedValue({ userId: "user-1", role: "MEMBER" });
    vi.mocked(createEvent).mockResolvedValue({ eventId: "event-1" });
    vi.mocked(CreateEventSchema.safeParse).mockReturnValue({
      success: true,
      data: {
        title: "Test Event",
        eventType: "general",
        format: "virtual",
        timezone: "UTC",
        startTime: new Date(Date.now() + 86400000).toISOString(),
        endTime: new Date(Date.now() + 90000000).toISOString(),
        recurrencePattern: "none",
      },
    } as ReturnType<typeof CreateEventSchema.safeParse>);
  });

  it("returns 201 creates event when Professional member submits valid body", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("POST", { title: "Test Event" }));
    expect(res.status).toBe(201);
  });

  it("returns 401 when unauthenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(requireAuthenticatedSession).mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const { POST } = await import("./route");
    // The withApiHandler passes through — test that requireAuthenticatedSession throws
    await expect(POST(makeRequest("POST", { title: "Test" }))).rejects.toMatchObject({
      status: 401,
    });
  });

  it("returns 403 when Basic member (service throws ApiError 403)", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(createEvent).mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const { POST } = await import("./route");
    await expect(POST(makeRequest("POST", { title: "Test" }))).rejects.toMatchObject({
      status: 403,
    });
  });

  it("returns 422 when body missing required fields", async () => {
    vi.mocked(CreateEventSchema.safeParse).mockReturnValue({
      success: false,
      error: { issues: [{ message: "Title is required" }] },
    } as unknown as ReturnType<typeof CreateEventSchema.safeParse>);
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(createEvent).mockRejectedValue(
      new ApiError({ title: "Unprocessable Entity", status: 422 }),
    );
    const { POST } = await import("./route");
    await expect(POST(makeRequest("POST", {}))).rejects.toMatchObject({ status: 422 });
  });
});
