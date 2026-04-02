// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

const mockGetGroupById = vi.fn();
const mockGetGroupMember = vi.fn();
vi.mock("@igbo/db/queries/groups", () => ({
  getGroupById: (...args: unknown[]) => mockGetGroupById(...args),
  getGroupMember: (...args: unknown[]) => mockGetGroupMember(...args),
}));

const mockSoftDeleteGroupPost = vi.fn();
vi.mock("@igbo/db/queries/posts", () => ({
  softDeleteGroupPost: (...args: unknown[]) => mockSoftDeleteGroupPost(...args),
}));

const mockLogGroupModerationAction = vi.fn();
vi.mock("@/services/audit-logger", () => ({
  logGroupModerationAction: (...args: unknown[]) => mockLogGroupModerationAction(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: { GROUP_MANAGE: { maxRequests: 20, windowMs: 60_000 } },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 19, resetAt: Date.now() + 60_000, limit: 20 }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { DELETE } from "./route";
import { ApiError } from "@/lib/api-error";

const MODERATOR_ID = "00000000-0000-4000-8000-000000000001";
const GROUP_ID = "00000000-0000-4000-8000-000000000002";
const POST_ID = "00000000-0000-4000-8000-000000000003";

const BASE_URL = `https://localhost:3000/api/v1/groups/${GROUP_ID}/posts/${POST_ID}`;
const CSRF_HEADERS = { Host: "localhost:3000", Origin: "https://localhost:3000" };

const mockGroup = { id: GROUP_ID, name: "Test Group", deletedAt: null };
const mockPost = { id: POST_ID, groupId: GROUP_ID, deletedAt: null };

beforeEach(() => {
  mockRequireAuthenticatedSession.mockReset();
  mockGetGroupById.mockReset();
  mockGetGroupMember.mockReset();
  mockSoftDeleteGroupPost.mockReset();
  mockLogGroupModerationAction.mockReset();

  mockRequireAuthenticatedSession.mockResolvedValue({ userId: MODERATOR_ID, role: "MEMBER" });
  mockGetGroupById.mockResolvedValue(mockGroup);
  mockGetGroupMember.mockResolvedValue({ role: "leader", status: "active" });
  mockSoftDeleteGroupPost.mockResolvedValue(mockPost);
  mockLogGroupModerationAction.mockResolvedValue(undefined);
});

describe("DELETE /api/v1/groups/[groupId]/posts/[postId]", () => {
  it("returns 200 with deleted:true when leader deletes a post", async () => {
    const req = new Request(BASE_URL, { method: "DELETE", headers: CSRF_HEADERS });
    const res = await DELETE(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);
    expect(mockSoftDeleteGroupPost).toHaveBeenCalledWith(POST_ID, GROUP_ID);
    expect(mockLogGroupModerationAction).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: GROUP_ID,
        moderatorId: MODERATOR_ID,
        targetType: "post",
        targetId: POST_ID,
        action: "remove_post",
      }),
    );
  });

  it("returns 400 when groupId is not a valid UUID", async () => {
    const req = new Request(`https://localhost:3000/api/v1/groups/bad-id/posts/${POST_ID}`, {
      method: "DELETE",
      headers: CSRF_HEADERS,
    });
    const res = await DELETE(req);

    expect(res.status).toBe(400);
  });

  it("returns 400 when postId is not a valid UUID", async () => {
    const req = new Request(`https://localhost:3000/api/v1/groups/${GROUP_ID}/posts/bad-id`, {
      method: "DELETE",
      headers: CSRF_HEADERS,
    });
    const res = await DELETE(req);

    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );

    const req = new Request(BASE_URL, { method: "DELETE", headers: CSRF_HEADERS });
    const res = await DELETE(req);

    expect(res.status).toBe(401);
  });

  it("returns 404 when group not found", async () => {
    mockGetGroupById.mockResolvedValue(null);

    const req = new Request(BASE_URL, { method: "DELETE", headers: CSRF_HEADERS });
    const res = await DELETE(req);

    expect(res.status).toBe(404);
  });

  it("returns 403 when caller is a regular member", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });

    const req = new Request(BASE_URL, { method: "DELETE", headers: CSRF_HEADERS });
    const res = await DELETE(req);

    expect(res.status).toBe(403);
  });

  it("returns 403 when caller is not a member", async () => {
    mockGetGroupMember.mockResolvedValue(null);

    const req = new Request(BASE_URL, { method: "DELETE", headers: CSRF_HEADERS });
    const res = await DELETE(req);

    expect(res.status).toBe(403);
  });

  it("returns 404 when post not found in group", async () => {
    mockSoftDeleteGroupPost.mockResolvedValue(null);

    const req = new Request(BASE_URL, { method: "DELETE", headers: CSRF_HEADERS });
    const res = await DELETE(req);

    expect(res.status).toBe(404);
  });
});
