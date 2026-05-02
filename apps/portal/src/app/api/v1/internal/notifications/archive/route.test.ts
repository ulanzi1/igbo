// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/api-middleware", () => ({
  withApiHandler: vi.fn((handler: (req: Request) => Promise<Response>) => handler),
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
vi.mock("@/lib/api-response", () => ({
  successResponse: vi.fn((data: unknown) => Response.json({ data }, { status: 200 })),
}));

const mockDeleteOldPortalNotifications = vi.fn();
vi.mock("@igbo/db/queries/portal-notifications", () => ({
  deleteOldPortalNotifications: (...args: unknown[]) => mockDeleteOldPortalNotifications(...args),
}));

function makeReq(authHeader?: string) {
  return new Request("http://localhost/api/v1/internal/notifications/archive", {
    method: "POST",
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("INTERNAL_JOB_SECRET", "test-secret");
  mockDeleteOldPortalNotifications.mockResolvedValue(0);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/v1/internal/notifications/archive", () => {
  it("deletes old notifications and returns deleted count", async () => {
    mockDeleteOldPortalNotifications.mockResolvedValue(42);

    const { POST } = await import("./route");
    const res = await POST(makeReq("Bearer test-secret"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { deleted: number } };
    expect(body.data.deleted).toBe(42);
    expect(mockDeleteOldPortalNotifications).toHaveBeenCalledOnce();
  });

  it("passes cutoff date approximately 90 days in the past", async () => {
    mockDeleteOldPortalNotifications.mockResolvedValue(0);

    const before = Date.now();
    const { POST } = await import("./route");
    await POST(makeReq("Bearer test-secret"));
    const after = Date.now();

    const [cutoff] = mockDeleteOldPortalNotifications.mock.calls[0]! as [Date];
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - ninetyDaysMs - 100);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - ninetyDaysMs + 100);
  });

  it("returns { deleted: 0 } when no old notifications", async () => {
    mockDeleteOldPortalNotifications.mockResolvedValue(0);

    const { POST } = await import("./route");
    const res = await POST(makeReq("Bearer test-secret"));

    const body = (await res.json()) as { data: { deleted: number } };
    expect(body.data.deleted).toBe(0);
  });

  it("rejects unauthenticated calls with rejects.toThrow (internal auth guard)", async () => {
    const { POST } = await import("./route");
    await expect(POST(makeReq())).rejects.toThrow();
  });

  it("rejects wrong-secret calls", async () => {
    const { POST } = await import("./route");
    await expect(POST(makeReq("Bearer wrong-secret"))).rejects.toThrow();
  });
});

describe("archive route configuration", () => {
  it("is registered with skipCsrf: true (machine-to-machine endpoint)", async () => {
    vi.resetModules();
    vi.stubEnv("INTERNAL_JOB_SECRET", "test-secret");
    const { withApiHandler } = await import("@/lib/api-middleware");
    await import("./route");
    expect(withApiHandler).toHaveBeenCalledWith(expect.any(Function), { skipCsrf: true });
  });
});
