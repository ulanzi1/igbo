// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockGetGroupById = vi.fn();
const mockGetGroupMember = vi.fn();
const mockUpdateGroupSettings = vi.fn();

vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

const mockListPendingMembers = vi.fn();

vi.mock("@igbo/db/queries/groups", () => ({
  getGroupById: (...args: unknown[]) => mockGetGroupById(...args),
  getGroupMember: (...args: unknown[]) => mockGetGroupMember(...args),
  listPendingMembers: (...args: unknown[]) => mockListPendingMembers(...args),
}));

vi.mock("@/services/group-service", () => ({
  updateGroupSettings: (...args: unknown[]) => mockUpdateGroupSettings(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    GROUP_DETAIL: { maxRequests: 120, windowMs: 60_000 },
    GROUP_UPDATE: { maxRequests: 20, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 119,
    resetAt: Date.now() + 60_000,
    limit: 120,
  }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET, PATCH } from "./route";
import { ApiError } from "@/lib/api-error";

const VIEWER_ID = "00000000-0000-4000-8000-000000000001";
const GROUP_ID = "00000000-0000-4000-8000-000000000002";
const BASE_URL = `https://example.com/api/v1/groups/${GROUP_ID}`;

// CSRF-valid headers required for mutating requests (PATCH/POST/PUT/DELETE)
const CSRF_HEADERS = { Host: "example.com", Origin: "https://example.com" };

const mockGroup = {
  id: GROUP_ID,
  name: "London Chapter",
  description: "For Igbo diaspora in London",
  bannerUrl: null,
  visibility: "public" as const,
  joinType: "open" as const,
  postingPermission: "all_members" as const,
  commentingPermission: "open" as const,
  memberLimit: null,
  memberCount: 5,
  creatorId: VIEWER_ID,
  deletedAt: null,
  createdAt: new Date("2026-03-01"),
  updatedAt: new Date("2026-03-01"),
};

beforeEach(() => {
  mockRequireAuthenticatedSession.mockReset();
  mockGetGroupById.mockReset();
  mockGetGroupMember.mockReset();
  mockUpdateGroupSettings.mockReset();
  mockListPendingMembers.mockReset();

  mockRequireAuthenticatedSession.mockResolvedValue({ userId: VIEWER_ID, role: "MEMBER" });
  mockGetGroupById.mockResolvedValue(mockGroup);
  mockGetGroupMember.mockResolvedValue({ role: "creator", status: "active" });
  mockUpdateGroupSettings.mockResolvedValue(mockGroup);
  mockListPendingMembers.mockResolvedValue([]);
});

describe("GET /api/v1/groups/[groupId]", () => {
  it("returns 200 with group detail and viewer membership", async () => {
    const request = new Request(BASE_URL);
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    const data = (body as { data: { group: { name: string }; viewerMembership: { role: string } } })
      .data;
    expect(data.group.name).toBe("London Chapter");
    expect(data.viewerMembership?.role).toBe("creator");
  });

  it("returns viewerMembership as null for non-members", async () => {
    mockGetGroupMember.mockResolvedValue(null);

    const request = new Request(BASE_URL);
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    const data = (body as { data: { viewerMembership: unknown } }).data;
    expect(data.viewerMembership).toBeNull();
  });

  it("returns 404 when group not found", async () => {
    mockGetGroupById.mockResolvedValue(null);

    const request = new Request(BASE_URL);
    const response = await GET(request);

    expect(response.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );

    const request = new Request(BASE_URL);
    const response = await GET(request);

    expect(response.status).toBe(401);
  });
});

describe("PATCH /api/v1/groups/[groupId]", () => {
  it("returns 200 with updated group on success", async () => {
    const updatedGroup = { ...mockGroup, name: "Updated Name" };
    mockUpdateGroupSettings.mockResolvedValue(updatedGroup);

    const request = new Request(BASE_URL, {
      method: "PATCH",
      headers: { ...CSRF_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Name" }),
    });
    const response = await PATCH(request);

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    const data = (body as { data: { group: { name: string } } }).data;
    expect(data.group.name).toBe("Updated Name");
  });

  it("calls updateGroupSettings with correct args", async () => {
    const request = new Request(BASE_URL, {
      method: "PATCH",
      headers: { ...CSRF_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: "private" }),
    });
    await PATCH(request);

    expect(mockUpdateGroupSettings).toHaveBeenCalledWith(
      VIEWER_ID,
      GROUP_ID,
      expect.objectContaining({ visibility: "private" }),
    );
  });

  it("returns 403 when service throws 403", async () => {
    mockUpdateGroupSettings.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));

    const request = new Request(BASE_URL, {
      method: "PATCH",
      headers: { ...CSRF_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New" }),
    });
    const response = await PATCH(request);

    expect(response.status).toBe(403);
  });

  it("returns 422 for invalid body", async () => {
    const request = new Request(BASE_URL, {
      method: "PATCH",
      headers: { ...CSRF_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: "INVALID_ENUM_VALUE" }),
    });
    const response = await PATCH(request);

    expect(response.status).toBe(422);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );

    const request = new Request(BASE_URL, {
      method: "PATCH",
      headers: { ...CSRF_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New" }),
    });
    const response = await PATCH(request);

    expect(response.status).toBe(401);
  });
});
