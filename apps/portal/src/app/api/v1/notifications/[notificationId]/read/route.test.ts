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

const mockGetPortalNotificationById = vi.fn();
const mockMarkPortalNotificationRead = vi.fn();
vi.mock("@igbo/db/queries/portal-notifications", () => ({
  getPortalNotificationById: (...args: unknown[]) => mockGetPortalNotificationById(...args),
  markPortalNotificationRead: (...args: unknown[]) => mockMarkPortalNotificationRead(...args),
}));

const mockInvalidateUnreadCount = vi.fn();
vi.mock("@/services/notification-count-service", () => ({
  invalidateUnreadCount: (...args: unknown[]) => mockInvalidateUnreadCount(...args),
}));

const USER_ID = "user-1";
const NOTIF_ID = "notif-1";

function makeReq() {
  return new Request(`https://jobs.igbo.com/api/v1/notifications/${NOTIF_ID}/read`, {
    method: "PATCH",
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

describe("PATCH /api/v1/notifications/[notificationId]/read", () => {
  it("marks notification as read and returns 200", async () => {
    mockGetPortalNotificationById.mockResolvedValue({ id: NOTIF_ID, readAt: null });
    mockMarkPortalNotificationRead.mockResolvedValue({ id: NOTIF_ID, readAt: new Date() });

    const { PATCH } = await import("./route");
    const res = await PATCH(makeReq());

    expect(res.status).toBe(200);
    expect(mockMarkPortalNotificationRead).toHaveBeenCalledWith(NOTIF_ID, USER_ID);
    expect(mockInvalidateUnreadCount).toHaveBeenCalledWith(USER_ID);
  });

  it("returns 200 even if already read (idempotent)", async () => {
    mockGetPortalNotificationById.mockResolvedValue({
      id: NOTIF_ID,
      readAt: new Date("2026-04-01"),
    });
    mockMarkPortalNotificationRead.mockResolvedValue({
      id: NOTIF_ID,
      readAt: new Date("2026-04-01"),
    });

    const { PATCH } = await import("./route");
    const res = await PATCH(makeReq());

    expect(res.status).toBe(200);
  });

  it("returns 404 when notification not found for this user", async () => {
    mockGetPortalNotificationById.mockResolvedValue(null);

    const { PATCH } = await import("./route");
    await expect(PATCH(makeReq())).rejects.toMatchObject({ status: 404 });
    expect(mockMarkPortalNotificationRead).not.toHaveBeenCalled();
  });

  it("throws 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { PATCH } = await import("./route");
    await expect(PATCH(makeReq())).rejects.toMatchObject({ status: 401 });
  });
});
