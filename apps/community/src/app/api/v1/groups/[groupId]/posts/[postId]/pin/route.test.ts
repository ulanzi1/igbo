// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockGetGroupMember = vi.fn();
const mockTogglePostPin = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@igbo/db/queries/groups", () => ({
  getGroupMember: (...args: unknown[]) => mockGetGroupMember(...args),
}));

vi.mock("@igbo/db/queries/posts", () => ({
  togglePostPin: (...args: unknown[]) => mockTogglePostPin(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    GROUP_MANAGE: { maxRequests: 20, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000, limit: 10 }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("@igbo/db", () => ({ db: mockDb }));
vi.mock("@igbo/db/schema/community-posts", () => ({
  communityPosts: {
    id: "id",
    isPinned: "is_pinned",
    pinnedAt: "pinned_at",
    groupId: "group_id",
    deletedAt: "deleted_at",
  },
}));

import { PATCH } from "./route";
import { ApiError } from "@/lib/api-error";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const GROUP_ID = "00000000-0000-4000-8000-000000000002";
const POST_ID = "00000000-0000-4000-8000-000000000004";
const OTHER_GROUP_ID = "00000000-0000-4000-8000-000000000099";
const BASE_URL = `https://localhost:3000/api/v1/groups/${GROUP_ID}/posts/${POST_ID}/pin`;
const CSRF_HEADERS = { Host: "localhost:3000", Origin: "https://localhost:3000" };

function makeSelectChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  ["from", "where"].forEach((k) => {
    chain[k] = vi.fn().mockReturnValue(chain);
  });
  chain["then"] = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

function makeRequest(groupId = GROUP_ID, postId = POST_ID) {
  return new Request(`https://localhost:3000/api/v1/groups/${groupId}/posts/${postId}/pin`, {
    method: "PATCH",
    headers: CSRF_HEADERS,
  });
}

beforeEach(() => {
  mockRequireAuthenticatedSession.mockReset();
  mockGetGroupMember.mockReset();
  mockTogglePostPin.mockReset();
  mockDb.select.mockReset();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
});

describe("PATCH /api/v1/groups/[groupId]/posts/[postId]/pin", () => {
  it("returns 200 with pinned=true when leader pins a post", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "leader", status: "active" });
    mockDb.select.mockReturnValue(
      makeSelectChain([{ id: POST_ID, isPinned: false, groupId: GROUP_ID }]),
    );
    mockTogglePostPin.mockResolvedValue({ id: POST_ID, isPinned: true });

    const res = await PATCH(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ pinned: true });
  });

  it("returns 200 with pinned=false when leader unpins a post", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "creator", status: "active" });
    mockDb.select.mockReturnValue(
      makeSelectChain([{ id: POST_ID, isPinned: true, groupId: GROUP_ID }]),
    );
    mockTogglePostPin.mockResolvedValue({ id: POST_ID, isPinned: false });

    const res = await PATCH(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ pinned: false });
  });

  it("returns 403 when member (non-leader) tries to pin", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });

    const res = await PATCH(makeRequest());

    expect(res.status).toBe(403);
  });

  it("returns 403 when user is not a group member", async () => {
    mockGetGroupMember.mockResolvedValue(null);

    const res = await PATCH(makeRequest());

    expect(res.status).toBe(403);
  });

  it("returns 404 when post not found", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "leader", status: "active" });
    mockDb.select.mockReturnValue(makeSelectChain([]));

    const res = await PATCH(makeRequest());

    expect(res.status).toBe(404);
  });

  it("returns 404 when post belongs to a different group", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "leader", status: "active" });
    mockDb.select.mockReturnValue(
      makeSelectChain([{ id: POST_ID, isPinned: false, groupId: OTHER_GROUP_ID }]),
    );

    const res = await PATCH(makeRequest());

    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ status: 401, title: "Unauthorized" }),
    );

    const res = await PATCH(makeRequest());

    expect(res.status).toBe(401);
  });
});
