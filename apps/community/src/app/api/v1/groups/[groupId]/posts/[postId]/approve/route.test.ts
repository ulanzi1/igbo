// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockGetGroupById = vi.fn();
const mockGetGroupMember = vi.fn();
const mockApproveGroupPost = vi.fn();
const mockEventBusEmit = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/db/queries/groups", () => ({
  getGroupById: (...args: unknown[]) => mockGetGroupById(...args),
  getGroupMember: (...args: unknown[]) => mockGetGroupMember(...args),
}));

vi.mock("@/db/queries/posts", () => ({
  approveGroupPost: (...args: unknown[]) => mockApproveGroupPost(...args),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: (...args: unknown[]) => mockEventBusEmit(...args) },
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    GROUP_MANAGE: { maxRequests: 30, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 29, resetAt: Date.now() + 60_000, limit: 30 }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { POST } from "./route";
import { ApiError } from "@/lib/api-error";

const LEADER_ID = "00000000-0000-4000-8000-000000000001";
const GROUP_ID = "00000000-0000-4000-8000-000000000002";
const POST_ID = "00000000-0000-4000-8000-000000000003";
const BASE_URL = `https://localhost:3000/api/v1/groups/${GROUP_ID}/posts/${POST_ID}/approve`;
const CSRF_HEADERS = { Host: "localhost:3000", Origin: "https://localhost:3000" };

beforeEach(() => {
  mockRequireAuthenticatedSession.mockReset();
  mockGetGroupById.mockReset();
  mockGetGroupMember.mockReset();
  mockApproveGroupPost.mockReset();
  mockEventBusEmit.mockReset();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: LEADER_ID });
  mockGetGroupById.mockResolvedValue({ id: GROUP_ID, name: "Test Group" });
  mockGetGroupMember.mockResolvedValue({ role: "leader", status: "active" });
  mockApproveGroupPost.mockResolvedValue(true);
  mockEventBusEmit.mockResolvedValue(undefined);
});

describe("POST /api/v1/groups/[groupId]/posts/[postId]/approve", () => {
  it("returns 200 when leader approves pending post", async () => {
    const req = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...CSRF_HEADERS },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ approved: true });
    expect(mockApproveGroupPost).toHaveBeenCalledWith(POST_ID, GROUP_ID);
  });

  it("emits post.published after approval", async () => {
    const req = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...CSRF_HEADERS },
    });
    await POST(req);

    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "post.published",
      expect.objectContaining({ postId: POST_ID, groupId: GROUP_ID }),
    );
  });

  it("returns 403 for regular member (not leader/creator)", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });

    const req = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...CSRF_HEADERS },
    });
    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  it("returns 404 when group not found", async () => {
    mockGetGroupById.mockResolvedValue(null);

    const req = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...CSRF_HEADERS },
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
  });

  it("returns 404 when pending post not found in group", async () => {
    mockApproveGroupPost.mockResolvedValue(false);

    const req = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...CSRF_HEADERS },
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ status: 401, title: "Unauthorized" }),
    );

    const req = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...CSRF_HEADERS },
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("allows creator to approve posts", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "creator", status: "active" });

    const req = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...CSRF_HEADERS },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ approved: true });
  });
});
