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

const mockDismissPortalNotification = vi.fn();
vi.mock("@igbo/db/queries/portal-notifications", () => ({
  dismissPortalNotification: (...args: unknown[]) => mockDismissPortalNotification(...args),
}));

const mockInvalidateUnreadCount = vi.fn();
vi.mock("@/services/notification-count-service", () => ({
  invalidateUnreadCount: (...args: unknown[]) => mockInvalidateUnreadCount(...args),
}));

const USER_ID = "user-1";
const OTHER_USER_ID = "user-99";
const NOTIF_ID = "notif-1";

function makeReq(userId = USER_ID) {
  return new Request(`https://jobs.igbo.com/api/v1/notifications/${NOTIF_ID}`, {
    method: "DELETE",
    headers: {
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
    },
  });
  void userId; // url is enough; auth mock determines user
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: USER_ID } });
  mockInvalidateUnreadCount.mockResolvedValue(undefined);
});

describe("DELETE /api/v1/notifications/[notificationId]", () => {
  it("dismisses an unread notification and invalidates unread count", async () => {
    const dismissed = { id: NOTIF_ID, userId: USER_ID, readAt: null, dismissedAt: new Date() };
    mockDismissPortalNotification.mockResolvedValue(dismissed);

    const { DELETE } = await import("./route");
    const res = await DELETE(makeReq());

    expect(res.status).toBe(200);
    expect(mockDismissPortalNotification).toHaveBeenCalledWith(NOTIF_ID, USER_ID);
    expect(mockInvalidateUnreadCount).toHaveBeenCalledWith(USER_ID);
  });

  it("dismisses an already-read notification without invalidating count", async () => {
    const dismissed = {
      id: NOTIF_ID,
      userId: USER_ID,
      readAt: new Date("2026-04-01"),
      dismissedAt: new Date(),
    };
    mockDismissPortalNotification.mockResolvedValue(dismissed);

    const { DELETE } = await import("./route");
    const res = await DELETE(makeReq());

    expect(res.status).toBe(200);
    expect(mockInvalidateUnreadCount).not.toHaveBeenCalled();
  });

  it("returns 404 when notification not found for this user (wrong user guard)", async () => {
    mockDismissPortalNotification.mockResolvedValue(null);
    mockAuth.mockResolvedValue({ user: { id: OTHER_USER_ID } });

    const { DELETE } = await import("./route");
    await expect(DELETE(makeReq())).rejects.toMatchObject({ status: 404 });

    // Guard verified: DB returned null for wrong-user, route did not call invalidate
    expect(mockInvalidateUnreadCount).not.toHaveBeenCalled();
  });

  it("throws 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { DELETE } = await import("./route");
    await expect(DELETE(makeReq())).rejects.toMatchObject({ status: 401 });
  });
});
