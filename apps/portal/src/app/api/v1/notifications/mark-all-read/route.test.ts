// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockAuth = vi.fn();
vi.mock("@igbo/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));

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

const mockMarkAllPortalNotificationsRead = vi.fn();
vi.mock("@igbo/db/queries/portal-notifications", () => ({
  markAllPortalNotificationsRead: (...args: unknown[]) =>
    mockMarkAllPortalNotificationsRead(...args),
}));

const mockInvalidateUnreadCount = vi.fn();
vi.mock("@/services/notification-count-service", () => ({
  invalidateUnreadCount: (...args: unknown[]) => mockInvalidateUnreadCount(...args),
}));

const USER_ID = "user-1";

function makeReq() {
  return new Request("https://jobs.igbo.com/api/v1/notifications/mark-all-read", {
    method: "POST",
    headers: {
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: USER_ID } });
  mockInvalidateUnreadCount.mockResolvedValue(undefined);
});

describe("POST /api/v1/notifications/mark-all-read", () => {
  it("marks all as read and returns updated count", async () => {
    mockMarkAllPortalNotificationsRead.mockResolvedValue(5);

    const { POST } = await import("./route");
    const res = await POST(makeReq());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { updated: number } };
    expect(body.data.updated).toBe(5);
    expect(mockInvalidateUnreadCount).toHaveBeenCalledWith(USER_ID);
  });

  it("returns { updated: 0 } when no unread notifications", async () => {
    mockMarkAllPortalNotificationsRead.mockResolvedValue(0);

    const { POST } = await import("./route");
    const res = await POST(makeReq());

    const body = (await res.json()) as { data: { updated: number } };
    expect(body.data.updated).toBe(0);
  });

  it("throws 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { POST } = await import("./route");
    await expect(POST(makeReq())).rejects.toMatchObject({ status: 401 });
  });
});
