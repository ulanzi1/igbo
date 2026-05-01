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
    detail?: string;
    constructor({ title, status, detail }: { title: string; status: number; detail?: string }) {
      super(title);
      this.status = status;
      this.detail = detail;
    }
  },
}));

const mockRequireAuthenticatedSession = vi.fn();
vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

const mockGetNotificationPreferences = vi.fn();
const mockUpsertNotificationPreference = vi.fn();
vi.mock("@igbo/db", () => ({
  getNotificationPreferences: (...args: unknown[]) => mockGetNotificationPreferences(...args),
  upsertNotificationPreference: (...args: unknown[]) => mockUpsertNotificationPreference(...args),
}));

const mockRedisClient = { del: vi.fn() };
vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(() => mockRedisClient),
}));
vi.mock("@igbo/config/redis", () => ({
  createRedisKey: (...parts: string[]) => parts.join(":"),
}));

// Use actual catalog
vi.mock("@igbo/config/notifications", async () => {
  const actual = await vi.importActual<typeof import("@igbo/config/notifications")>(
    "@igbo/config/notifications",
  );
  return actual;
});

const BASE_URL = "https://portal.igbo.com/api/v1/notifications/preferences";

function makeReq(method: "GET" | "PUT", body?: unknown) {
  return new Request(BASE_URL, {
    method,
    ...(body !== undefined && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  });
}

describe("GET /api/v1/notifications/preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthenticatedSession.mockResolvedValue({ userId: "user-1", role: "MEMBER" });
    mockGetNotificationPreferences.mockResolvedValue({});
  });

  it("returns merged preferences + catalog for authenticated user", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { preferences: Record<string, unknown>; catalog: Record<string, unknown> };
    };
    // Should include all 12 event types from catalog
    expect(Object.keys(body.data.preferences)).toHaveLength(12);
    expect(body.data.catalog).toBeDefined();
  });

  it("returns catalog defaults when user has no saved preferences", async () => {
    mockGetNotificationPreferences.mockResolvedValue({});
    const { GET } = await import("./route");
    const res = await GET(makeReq("GET"));
    const body = (await res.json()) as {
      data: {
        preferences: Record<
          string,
          { channelInApp: boolean; channelPush: boolean; channelEmail: boolean }
        >;
      };
    };
    // portal.saved_search.new_results default: inApp: true, push: false, email: false
    expect(body.data.preferences["portal.saved_search.new_results"]).toMatchObject({
      channelInApp: true,
      channelPush: false,
      channelEmail: false,
    });
  });

  it("returns user overrides where saved", async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      "portal.application.status_changed": {
        channelInApp: true,
        channelPush: false,
        channelEmail: false,
        digestMode: "none",
        quietHoursStart: null,
        quietHoursEnd: null,
        quietHoursTimezone: "UTC",
        lastDigestAt: null,
      },
    });
    const { GET } = await import("./route");
    const res = await GET(makeReq("GET"));
    const body = (await res.json()) as {
      data: { preferences: Record<string, { channelPush: boolean }> };
    };
    expect(body.data.preferences["portal.application.status_changed"]?.channelPush).toBe(false);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 401 }),
    );
    const { GET } = await import("./route");
    await expect(GET(makeReq("GET"))).rejects.toMatchObject({ status: 401 });
  });
});

describe("PUT /api/v1/notifications/preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthenticatedSession.mockResolvedValue({ userId: "user-1", role: "MEMBER" });
    mockUpsertNotificationPreference.mockResolvedValue(undefined);
    mockRedisClient.del.mockResolvedValue(1);
  });

  it("upserts user preference and returns success", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(
      makeReq("PUT", {
        eventType: "portal.application.status_changed",
        channelPush: false,
      }),
    );
    expect(res.status).toBe(200);
    expect(mockUpsertNotificationPreference).toHaveBeenCalledWith(
      "user-1",
      "portal.application.status_changed",
      { channelPush: false },
    );
  });

  it("invalidates Redis preference cache after successful upsert", async () => {
    const { PUT } = await import("./route");
    await PUT(
      makeReq("PUT", {
        eventType: "portal.application.status_changed",
        channelInApp: true,
      }),
    );
    expect(mockRedisClient.del).toHaveBeenCalledWith("notif:prefs:user-1");
  });

  it("rejects updates to system-critical event types with 400", async () => {
    const { PUT } = await import("./route");
    await expect(
      PUT(
        makeReq("PUT", {
          eventType: "portal.application.submitted",
          channelPush: false,
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(mockUpsertNotificationPreference).not.toHaveBeenCalled();
  });

  it("rejects updates to the other system-critical event type (portal.job.rejected) with 400", async () => {
    const { PUT } = await import("./route");
    await expect(
      PUT(
        makeReq("PUT", {
          eventType: "portal.job.rejected",
          channelEmail: false,
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 for invalid eventType", async () => {
    const { PUT } = await import("./route");
    await expect(
      PUT(makeReq("PUT", { eventType: "portal.totally.unknown" })),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 for missing body", async () => {
    const { PUT } = await import("./route");
    const req = new Request(BASE_URL, { method: "PUT", body: "not-json" });
    await expect(PUT(req)).rejects.toMatchObject({ status: 400 });
  });

  it("server does NOT enforce at-least-one-channel (client-side only)", async () => {
    // All channels disabled for a high-priority event → server accepts (200)
    const { PUT } = await import("./route");
    const res = await PUT(
      makeReq("PUT", {
        eventType: "portal.application.status_changed",
        channelInApp: false,
        channelPush: false,
        channelEmail: false,
      }),
    );
    expect(res.status).toBe(200);
    expect(mockUpsertNotificationPreference).toHaveBeenCalledWith(
      "user-1",
      "portal.application.status_changed",
      { channelInApp: false, channelPush: false, channelEmail: false },
    );
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 401 }),
    );
    const { PUT } = await import("./route");
    await expect(
      PUT(makeReq("PUT", { eventType: "portal.application.status_changed", channelPush: false })),
    ).rejects.toMatchObject({ status: 401 });
  });
});
