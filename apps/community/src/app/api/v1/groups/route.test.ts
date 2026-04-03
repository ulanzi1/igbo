// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockListGroups = vi.fn();

vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

const mockListGroupsForDirectory = vi.fn();
const mockBatchGetGroupMemberships = vi.fn();

vi.mock("@igbo/db/queries/groups", () => ({
  listGroups: (...args: unknown[]) => mockListGroups(...args),
  listGroupsForDirectory: (...args: unknown[]) => mockListGroupsForDirectory(...args),
  batchGetGroupMemberships: (...args: unknown[]) => mockBatchGetGroupMemberships(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    GROUP_LIST: { maxRequests: 60, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 59,
    resetAt: Date.now() + 60_000,
    limit: 60,
  }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET } from "./route";
import { ApiError } from "@/lib/api-error";

const VIEWER_ID = "00000000-0000-4000-8000-000000000001";
const GROUP_ID = "00000000-0000-4000-8000-000000000002";

const mockGroupItem = {
  id: GROUP_ID,
  name: "London Chapter",
  description: "For Igbo diaspora in London",
  bannerUrl: null,
  visibility: "public" as const,
  joinType: "open" as const,
  memberCount: 5,
  creatorId: VIEWER_ID,
  createdAt: "2026-03-01T10:00:00.000Z",
};

beforeEach(() => {
  mockRequireAuthenticatedSession.mockReset();
  mockListGroups.mockReset();

  mockRequireAuthenticatedSession.mockResolvedValue({ userId: VIEWER_ID, role: "MEMBER" });
  mockListGroups.mockResolvedValue([mockGroupItem]);
});

describe("GET /api/v1/groups", () => {
  it("returns 200 with paginated group list", async () => {
    const request = new Request("http://localhost/api/v1/groups");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    const data = (body as { data: { groups: unknown[] } }).data;
    expect(Array.isArray(data.groups)).toBe(true);
    expect(data.groups).toHaveLength(1);
  });

  it("passes nameFilter query param to listGroups", async () => {
    const request = new Request("http://localhost/api/v1/groups?name=London");
    await GET(request);

    expect(mockListGroups).toHaveBeenCalledWith(expect.objectContaining({ nameFilter: "London" }));
  });

  it("passes cursor query param to listGroups", async () => {
    const cursor = "2026-03-01T10:00:00.000Z";
    const request = new Request(`http://localhost/api/v1/groups?cursor=${cursor}`);
    await GET(request);

    expect(mockListGroups).toHaveBeenCalledWith(expect.objectContaining({ cursor }));
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );

    const request = new Request("http://localhost/api/v1/groups");
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("returns empty groups array when no groups found", async () => {
    mockListGroups.mockResolvedValue([]);

    const request = new Request("http://localhost/api/v1/groups");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    const data = (body as { data: { groups: unknown[] } }).data;
    expect(data.groups).toHaveLength(0);
  });

  it("returns nextCursor as null when fewer results than limit", async () => {
    mockListGroups.mockResolvedValue([mockGroupItem]); // 1 < default limit 20

    const request = new Request("http://localhost/api/v1/groups");
    const response = await GET(request);
    const body: unknown = await response.json();
    const data = (body as { data: { nextCursor: unknown } }).data;
    expect(data.nextCursor).toBeNull();
  });
});
