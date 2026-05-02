// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-middleware", () => ({
  withApiHandler: vi.fn((handler: (req: Request) => Promise<Response>, _opts?: unknown) => handler),
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

const mockAuth = vi.fn();
vi.mock("@igbo/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));

const mockGetUnreadNotificationCount = vi.fn();
vi.mock("@igbo/db", () => ({
  getUnreadNotificationCount: (...args: unknown[]) => mockGetUnreadNotificationCount(...args),
}));

describe("GET /api/v1/notifications/unread-count", () => {
  it("returns count for authenticated user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockGetUnreadNotificationCount.mockResolvedValue(5);

    const { GET } = await import("./route");
    const req = new Request("https://portal.igbo.com/api/v1/notifications/unread-count");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { count: number } };
    expect(body.data.count).toBe(5);
    expect(mockGetUnreadNotificationCount).toHaveBeenCalledWith("user-1");
  });

  it("throws 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { GET } = await import("./route");
    const req = new Request("https://portal.igbo.com/api/v1/notifications/unread-count");

    await expect(GET(req)).rejects.toMatchObject({ status: 401 });
  });
});
