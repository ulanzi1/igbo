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
  rsvpToEvent: vi.fn(),
  cancelEventRsvp: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  cancelEvent: vi.fn(),
  CreateEventSchema: { safeParse: vi.fn() },
  UpdateEventSchema: { safeParse: vi.fn() },
}));

vi.mock("@igbo/db/queries/events", () => ({
  getAttendeeStatus: vi.fn(),
  listUpcomingEvents: vi.fn(),
  listPastEvents: vi.fn(),
  listMyRsvps: vi.fn(),
  createEvent: vi.fn(),
  getEventById: vi.fn(),
  updateEvent: vi.fn(),
  cancelEvent: vi.fn(),
  listGroupEvents: vi.fn(),
  getEventsByParentId: vi.fn(),
  cancelAllEventRsvps: vi.fn(),
  rsvpToEvent: vi.fn(),
  cancelRsvp: vi.fn(),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    EVENT_RSVP: { maxRequests: 10, windowMs: 60000 },
  },
  applyRateLimit: vi.fn().mockResolvedValue({ success: true }),
}));

import { requireAuthenticatedSession } from "@/services/permissions";
import { rsvpToEvent, cancelEventRsvp } from "@/services/event-service";
import { getAttendeeStatus } from "@igbo/db/queries/events";

const makeRsvpRequest = (method: string) =>
  new Request("http://localhost/api/v1/events/event-1/rsvp", {
    method,
    headers: {
      "Content-Type": "application/json",
      Host: "localhost:3000",
      Origin: "https://localhost:3000",
    },
  });

describe("GET /api/v1/events/[eventId]/rsvp", () => {
  beforeEach(() => {
    vi.mocked(requireAuthenticatedSession).mockReset();
    vi.mocked(getAttendeeStatus).mockReset();
    vi.mocked(requireAuthenticatedSession).mockResolvedValue({ userId: "user-1", role: "MEMBER" });
  });

  it("returns 200 with status null for user with no RSVP", async () => {
    vi.mocked(getAttendeeStatus).mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRsvpRequest("GET"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { status: null } };
    expect(body.data.status).toBeNull();
  });

  it("returns 200 with registered status for registered user", async () => {
    vi.mocked(getAttendeeStatus).mockResolvedValue({
      status: "registered",
      waitlistPosition: null,
    });
    const { GET } = await import("./route");
    const res = await GET(makeRsvpRequest("GET"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { status: string; waitlistPosition: null } };
    expect(body.data.status).toBe("registered");
    expect(body.data.waitlistPosition).toBeNull();
  });

  it("returns 401 when unauthenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(requireAuthenticatedSession).mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const { GET } = await import("./route");
    await expect(GET(makeRsvpRequest("GET"))).rejects.toMatchObject({ status: 401 });
  });
});

describe("POST /api/v1/events/[eventId]/rsvp", () => {
  beforeEach(() => {
    vi.mocked(requireAuthenticatedSession).mockReset();
    vi.mocked(rsvpToEvent).mockReset();
    vi.mocked(requireAuthenticatedSession).mockResolvedValue({ userId: "user-1", role: "MEMBER" });
  });

  it("returns 201 for registered user", async () => {
    vi.mocked(rsvpToEvent).mockResolvedValue({
      status: "registered",
      waitlistPosition: null,
      attendeeCount: 1,
    });
    const { POST } = await import("./route");
    const res = await POST(makeRsvpRequest("POST"));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { status: string } };
    expect(body.data.status).toBe("registered");
  });

  it("returns 201 for waitlisted user with position 3", async () => {
    vi.mocked(rsvpToEvent).mockResolvedValue({
      status: "waitlisted",
      waitlistPosition: 3,
      attendeeCount: 10,
    });
    const { POST } = await import("./route");
    const res = await POST(makeRsvpRequest("POST"));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { status: string; waitlistPosition: number } };
    expect(body.data.status).toBe("waitlisted");
    expect(body.data.waitlistPosition).toBe(3);
  });

  it("throws 409 when already registered", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(rsvpToEvent).mockRejectedValue(
      new ApiError({ title: "Already registered", status: 409 }),
    );
    const { POST } = await import("./route");
    await expect(POST(makeRsvpRequest("POST"))).rejects.toMatchObject({ status: 409 });
  });

  it("returns 401 when unauthenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(requireAuthenticatedSession).mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const { POST } = await import("./route");
    await expect(POST(makeRsvpRequest("POST"))).rejects.toMatchObject({ status: 401 });
  });
});

describe("DELETE /api/v1/events/[eventId]/rsvp", () => {
  beforeEach(() => {
    vi.mocked(requireAuthenticatedSession).mockReset();
    vi.mocked(cancelEventRsvp).mockReset();
    vi.mocked(requireAuthenticatedSession).mockResolvedValue({ userId: "user-1", role: "MEMBER" });
  });

  it("returns 200 on successful RSVP cancellation", async () => {
    vi.mocked(cancelEventRsvp).mockResolvedValue(undefined);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRsvpRequest("DELETE"));
    expect(res.status).toBe(200);
  });

  it("throws 404 when no RSVP found", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(cancelEventRsvp).mockRejectedValue(
      new ApiError({ title: "No RSVP found", status: 404 }),
    );
    const { DELETE } = await import("./route");
    await expect(DELETE(makeRsvpRequest("DELETE"))).rejects.toMatchObject({ status: 404 });
  });
});
