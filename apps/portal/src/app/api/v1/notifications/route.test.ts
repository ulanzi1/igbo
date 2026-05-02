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

const mockGetPortalNotifications = vi.fn();
const mockEncodeCursor = vi.fn();
vi.mock("@igbo/db/queries/portal-notifications", () => ({
  getPortalNotifications: (...args: unknown[]) => mockGetPortalNotifications(...args),
  encodeCursor: (...args: unknown[]) => mockEncodeCursor(...args),
}));

const USER_ID = "user-1";
const NOW = new Date("2026-05-01T12:00:00Z");

function makeReq(cursor?: string) {
  const url = cursor
    ? `https://jobs.igbo.com/api/v1/notifications?cursor=${cursor}`
    : "https://jobs.igbo.com/api/v1/notifications";
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: USER_ID } });
});

describe("GET /api/v1/notifications", () => {
  it("returns notifications list for authenticated user", async () => {
    const notifs = [{ id: "n-1", title: "Test", createdAt: NOW.toISOString() }];
    mockGetPortalNotifications.mockResolvedValue(notifs);

    const { GET } = await import("./route");
    const res = await GET(makeReq());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[]; meta: { nextCursor: string | null } };
    expect(body.data).toHaveLength(1);
    expect((body.data[0] as { id: string }).id).toBe("n-1");
    expect(body.meta.nextCursor).toBeNull();
  });

  it("passes cursor parameter to query", async () => {
    mockGetPortalNotifications.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(makeReq("abc123"));

    expect(mockGetPortalNotifications).toHaveBeenCalledWith(USER_ID, {
      cursor: "abc123",
      limit: 20,
    });
  });

  it("returns nextCursor when page is full (20 items)", async () => {
    const notifs = Array.from({ length: 20 }, (_, i) => ({
      id: `n-${i}`,
      title: `Notif ${i}`,
      createdAt: NOW,
    }));
    mockGetPortalNotifications.mockResolvedValue(notifs);
    mockEncodeCursor.mockReturnValue("cursor-next");

    const { GET } = await import("./route");
    const res = await GET(makeReq());

    const body = (await res.json()) as { data: unknown[]; meta: { nextCursor: string } };
    expect(body.meta.nextCursor).toBe("cursor-next");
    expect(mockEncodeCursor).toHaveBeenCalledWith(notifs[19]);
  });

  it("returns empty list when no notifications", async () => {
    mockGetPortalNotifications.mockResolvedValue([]);

    const { GET } = await import("./route");
    const res = await GET(makeReq());

    const body = (await res.json()) as { data: unknown[]; meta: { nextCursor: null } };
    expect(body.data).toEqual([]);
    expect(body.meta.nextCursor).toBeNull();
  });

  it("throws 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { GET } = await import("./route");
    await expect(GET(makeReq())).rejects.toMatchObject({ status: 401 });
  });
});
