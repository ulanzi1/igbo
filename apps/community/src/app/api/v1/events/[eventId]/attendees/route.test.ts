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
  requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "creator-1", role: "MEMBER" }),
}));

vi.mock("@/services/event-service", () => ({
  listEventAttendees: vi.fn(),
  markAttendance: vi.fn(),
  getJoinToken: vi.fn(),
}));

vi.mock("@igbo/db/queries/events", () => ({
  getEventById: vi.fn(),
  getAttendeeStatus: vi.fn(),
}));

import { requireAuthenticatedSession } from "@/services/permissions";
import { listEventAttendees } from "@/services/event-service";
import { getEventById } from "@igbo/db/queries/events";

const makeRequest = () =>
  new Request("http://localhost/api/v1/events/event-1/attendees", {
    method: "GET",
    headers: {
      Host: "localhost:3000",
      Origin: "https://localhost:3000",
    },
  });

describe("GET /api/v1/events/[eventId]/attendees", () => {
  beforeEach(() => {
    vi.mocked(requireAuthenticatedSession).mockReset();
    vi.mocked(listEventAttendees).mockReset();
    vi.mocked(getEventById).mockReset();
    vi.mocked(requireAuthenticatedSession).mockResolvedValue({
      userId: "creator-1",
      role: "MEMBER",
    });
    vi.mocked(getEventById).mockResolvedValue({
      id: "event-1",
      creatorId: "creator-1",
    } as Parameters<typeof getEventById>[0] extends infer T ? never : never);
  });

  it("returns 200 with attendee list for event creator", async () => {
    vi.mocked(getEventById).mockResolvedValue({
      id: "event-1",
      creatorId: "creator-1",
    } as unknown as Awaited<ReturnType<typeof getEventById>>);

    vi.mocked(listEventAttendees).mockResolvedValue([
      { userId: "user-1", displayName: "Ada Eze", status: "registered", joinedAt: null },
      { userId: "user-2", displayName: "Emeka Obi", status: "attended", joinedAt: new Date() },
    ]);

    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { attendees: { userId: string }[] } };
    expect(body.data.attendees).toHaveLength(2);
    expect(body.data.attendees[0].userId).toBe("user-1");
  });

  it("returns 401 when unauthenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(requireAuthenticatedSession).mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const { GET } = await import("./route");
    await expect(GET(makeRequest())).rejects.toMatchObject({ status: 401 });
  });

  it("returns 403 when non-creator requests attendee list", async () => {
    vi.mocked(requireAuthenticatedSession).mockResolvedValue({
      userId: "other-user",
      role: "MEMBER",
    });
    vi.mocked(getEventById).mockResolvedValue({
      id: "event-1",
      creatorId: "creator-1", // different from caller
    } as unknown as Awaited<ReturnType<typeof getEventById>>);

    const { GET } = await import("./route");
    await expect(GET(makeRequest())).rejects.toMatchObject({ status: 403 });
  });

  it("returns 404 when event not found", async () => {
    vi.mocked(getEventById).mockResolvedValue(null);
    const { GET } = await import("./route");
    await expect(GET(makeRequest())).rejects.toMatchObject({ status: 404 });
  });
});
