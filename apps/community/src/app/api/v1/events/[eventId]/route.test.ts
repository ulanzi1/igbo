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
    (title: string, status = 500) => new Response(JSON.stringify({ title }), { status }),
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
  updateEvent: vi.fn().mockResolvedValue({ eventId: "event-1" }),
  cancelEvent: vi.fn().mockResolvedValue(undefined),
  UpdateEventSchema: {
    safeParse: vi.fn().mockReturnValue({ success: true, data: { title: "Updated" } }),
  },
}));

vi.mock("@igbo/db/queries/events", () => ({
  getEventById: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  cancelEvent: vi.fn(),
  listUpcomingEvents: vi.fn(),
  listGroupEvents: vi.fn(),
  getEventsByParentId: vi.fn(),
}));

vi.mock("@igbo/db/queries/groups", () => ({
  getGroupById: vi.fn().mockResolvedValue(null),
  getGroupMember: vi.fn(),
  getGroupsForUserMembership: vi.fn(),
}));

vi.mock("@/server/auth/config", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: { EVENT_UPDATE: { maxRequests: 20, windowMs: 60000 } },
  applyRateLimit: vi.fn().mockResolvedValue({ success: true }),
}));

import { getEventById } from "@igbo/db/queries/events";
import {
  updateEvent as serviceUpdateEvent,
  cancelEvent as serviceCancelEvent,
} from "@/services/event-service";
import { requireAuthenticatedSession } from "@/services/permissions";

const mockEvent = {
  id: "event-1",
  title: "Test Event",
  description: null,
  creatorId: "user-1",
  groupId: null,
  eventType: "general" as const,
  format: "virtual" as const,
  location: null,
  meetingLink: null,
  timezone: "UTC",
  startTime: new Date("2030-01-01T10:00:00Z"),
  endTime: new Date("2030-01-01T11:00:00Z"),
  durationMinutes: 60,
  registrationLimit: null,
  attendeeCount: 0,
  recurrencePattern: "none" as const,
  recurrenceParentId: null,
  status: "upcoming" as const,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const makeRequest = (method: string, body?: unknown) =>
  new Request("http://localhost/api/v1/events/event-1", {
    method,
    headers: {
      "Content-Type": "application/json",
      Host: "localhost:3000",
      Origin: "https://localhost:3000",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

describe("GET /api/v1/events/[eventId]", () => {
  beforeEach(() => {
    vi.mocked(getEventById).mockReset();
    vi.mocked(getEventById).mockResolvedValue(mockEvent);
  });

  it("returns 200 returns event detail for existing event", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
  });

  it("returns 404 when event not found", async () => {
    vi.mocked(getEventById).mockResolvedValue(null);
    const { GET } = await import("./route");
    await expect(GET(makeRequest("GET"))).rejects.toMatchObject({ status: 404 });
  });
});

describe("PATCH /api/v1/events/[eventId]", () => {
  beforeEach(() => {
    vi.mocked(requireAuthenticatedSession).mockReset();
    vi.mocked(serviceUpdateEvent).mockReset();
    vi.mocked(requireAuthenticatedSession).mockResolvedValue({ userId: "user-1", role: "MEMBER" });
    vi.mocked(serviceUpdateEvent).mockResolvedValue({ eventId: "event-1" });
  });

  it("returns 200 updates event when creator makes request", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest("PATCH", { title: "Updated" }));
    expect(res.status).toBe(200);
  });

  it("returns 403 when non-creator attempts update", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(serviceUpdateEvent).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );
    const { PATCH } = await import("./route");
    await expect(PATCH(makeRequest("PATCH", { title: "x" }))).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe("DELETE /api/v1/events/[eventId]", () => {
  beforeEach(() => {
    vi.mocked(requireAuthenticatedSession).mockReset();
    vi.mocked(serviceCancelEvent).mockReset();
    vi.mocked(requireAuthenticatedSession).mockResolvedValue({ userId: "user-1", role: "MEMBER" });
    vi.mocked(serviceCancelEvent).mockResolvedValue(undefined);
  });

  it("returns 200 cancels event with valid cancellationReason", async () => {
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest("DELETE", { cancellationReason: "Venue unavailable" }));
    expect(res.status).toBe(200);
  });

  it("returns 422 when no body provided", async () => {
    const req = new Request("http://localhost/api/v1/events/event-1", {
      method: "DELETE",
      headers: { Host: "localhost:3000", Origin: "https://localhost:3000" },
      // no body
    });
    const { DELETE } = await import("./route");
    await expect(DELETE(req)).rejects.toMatchObject({ status: 422 });
  });

  it("returns 422 when cancellationReason is empty string", async () => {
    const { DELETE } = await import("./route");
    await expect(DELETE(makeRequest("DELETE", { cancellationReason: "" }))).rejects.toMatchObject({
      status: 422,
    });
  });

  it("calls cancelEvent with userId, eventId, and reason", async () => {
    const { DELETE } = await import("./route");
    await DELETE(makeRequest("DELETE", { cancellationReason: "Weather emergency" }));
    expect(serviceCancelEvent).toHaveBeenCalledWith("user-1", "event-1", "Weather emergency");
  });

  it("returns 404 when event not found (service throws 404)", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(serviceCancelEvent).mockRejectedValue(
      new ApiError({ title: "Not Found", status: 404 }),
    );
    const { DELETE } = await import("./route");
    await expect(
      DELETE(makeRequest("DELETE", { cancellationReason: "reason" })),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("PATCH /api/v1/events/[eventId] — dateChangeComment", () => {
  beforeEach(() => {
    vi.mocked(requireAuthenticatedSession).mockReset();
    vi.mocked(serviceUpdateEvent).mockReset();
    vi.mocked(requireAuthenticatedSession).mockResolvedValue({ userId: "user-1", role: "MEMBER" });
    vi.mocked(serviceUpdateEvent).mockResolvedValue({ eventId: "event-1" });
  });

  it("returns 422 when startTime changed but no dateChangeComment (service validation)", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(serviceUpdateEvent).mockRejectedValue(
      new ApiError({ title: "A note is required when changing the event date", status: 422 }),
    );
    const futureStart = new Date(Date.now() + 172800000).toISOString();
    const { PATCH } = await import("./route");
    await expect(PATCH(makeRequest("PATCH", { startTime: futureStart }))).rejects.toMatchObject({
      status: 422,
    });
  });
});
