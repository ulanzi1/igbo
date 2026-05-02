// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-middleware", () => ({
  withApiHandler: vi.fn((handler: (req: Request) => Promise<Response>) => handler),
}));
vi.mock("@/lib/api-response", () => ({
  successResponse: vi.fn((data: unknown) => Response.json({ data }, { status: 200 })),
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

const mockRequireAuthenticatedSession = vi.fn();
vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

const mockGetNotificationPreferences = vi.fn();
const mockSetQuietHours = vi.fn();
vi.mock("@igbo/db", () => ({
  getNotificationPreferences: (...args: unknown[]) => mockGetNotificationPreferences(...args),
  setQuietHours: (...args: unknown[]) => mockSetQuietHours(...args),
}));

const BASE_URL = "https://portal.igbo.com/api/v1/notifications/quiet-hours";

function makeReq(method: "GET" | "PUT", body?: unknown) {
  return new Request(BASE_URL, {
    method,
    ...(body !== undefined && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  });
}

describe("GET /api/v1/notifications/quiet-hours", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthenticatedSession.mockResolvedValue({ userId: "user-1", role: "MEMBER" });
  });

  it("returns saved quiet hours when preferences exist", async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      "portal.application.status_changed": {
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
        quietHoursTimezone: "Africa/Lagos",
      },
    });
    const { GET } = await import("./route");
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { start: string; end: string; timezone: string } };
    expect(body.data.start).toBe("22:00");
    expect(body.data.end).toBe("08:00");
    expect(body.data.timezone).toBe("Africa/Lagos");
  });

  it("returns { start: null, end: null, timezone: null } when user has no preference rows (cold-start)", async () => {
    mockGetNotificationPreferences.mockResolvedValue({});
    const { GET } = await import("./route");
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { start: null; end: null; timezone: null } };
    expect(body.data.start).toBeNull();
    expect(body.data.end).toBeNull();
    expect(body.data.timezone).toBeNull();
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 401 }),
    );
    const { GET } = await import("./route");
    await expect(GET(makeReq("GET"))).rejects.toMatchObject({ status: 401 });
  });
});

describe("PUT /api/v1/notifications/quiet-hours", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthenticatedSession.mockResolvedValue({ userId: "user-1", role: "MEMBER" });
    mockSetQuietHours.mockResolvedValue(undefined);
  });

  it("saves quiet hours and returns success", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(
      makeReq("PUT", {
        start: "22:00",
        end: "08:00",
        timezone: "Africa/Lagos",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockSetQuietHours).toHaveBeenCalledWith("user-1", "22:00", "08:00", "Africa/Lagos");
  });

  it("clears quiet hours when start is null", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(
      makeReq("PUT", {
        start: null,
        end: null,
        timezone: "UTC",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockSetQuietHours).toHaveBeenCalledWith("user-1", null, null, "UTC");
  });

  it("returns 400 for invalid time format (not HH:MM)", async () => {
    const { PUT } = await import("./route");
    await expect(
      PUT(makeReq("PUT", { start: "9:00", end: "08:00", timezone: "UTC" })),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 for out-of-range time like 99:99", async () => {
    const { PUT } = await import("./route");
    await expect(
      PUT(makeReq("PUT", { start: "99:99", end: "08:00", timezone: "UTC" })),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 for out-of-range time like 25:00", async () => {
    const { PUT } = await import("./route");
    await expect(
      PUT(makeReq("PUT", { start: "25:00", end: "08:00", timezone: "UTC" })),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 for asymmetric null (start null, end non-null)", async () => {
    const { PUT } = await import("./route");
    await expect(
      PUT(makeReq("PUT", { start: null, end: "08:00", timezone: "UTC" })),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 for asymmetric null (start non-null, end null)", async () => {
    const { PUT } = await import("./route");
    await expect(
      PUT(makeReq("PUT", { start: "22:00", end: null, timezone: "UTC" })),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 for invalid timezone", async () => {
    const { PUT } = await import("./route");
    await expect(
      PUT(makeReq("PUT", { start: "22:00", end: "08:00", timezone: "Not/A/Real/Zone" })),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 for missing body", async () => {
    const { PUT } = await import("./route");
    const req = new Request(BASE_URL, { method: "PUT", body: "invalid-json" });
    await expect(PUT(req)).rejects.toMatchObject({ status: 400 });
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 401 }),
    );
    const { PUT } = await import("./route");
    await expect(
      PUT(makeReq("PUT", { start: "22:00", end: "08:00", timezone: "UTC" })),
    ).rejects.toMatchObject({ status: 401 });
  });
});
