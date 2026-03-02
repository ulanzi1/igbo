// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-auth", () => ({
  requireAdminSession: vi.fn().mockResolvedValue({ adminId: "admin-1" }),
}));
vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    PIN_POST: { maxRequests: 10, windowMs: 60_000 },
  },
}));
vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, limit: 10 }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/db", () => ({ db: mockDb }));
vi.mock("@/db/schema/community-posts", () => ({
  communityPosts: {
    id: "id",
    isPinned: "is_pinned",
    pinnedAt: "pinned_at",
    deletedAt: "deleted_at",
  },
}));

import { PATCH } from "./route";
import { requireAdminSession } from "@/lib/admin-auth";
import { ApiError } from "@/lib/api-error";

const mockRequireAdmin = vi.mocked(requireAdminSession);

const POST_ID = "550e8400-e29b-41d4-a716-446655440000";
const BASE_URL = "http://localhost";

function makeSelectChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  ["from", "where"].forEach((k) => {
    chain[k] = vi.fn().mockReturnValue(chain);
  });
  chain["then"] = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {};
  chain["set"] = vi.fn().mockReturnValue(chain);
  chain["where"] = vi.fn().mockResolvedValue([]);
  return chain;
}

function makeRequest(postId: string, body: unknown) {
  return new Request(`${BASE_URL}/api/v1/posts/${postId}/pin`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE_URL,
      Host: "localhost",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockRequireAdmin.mockReset();
  mockDb.select.mockReset();
  mockDb.update.mockReset();
  mockRequireAdmin.mockResolvedValue({ adminId: "admin-1" });
});

describe("PATCH /api/v1/posts/[postId]/pin", () => {
  it("returns 401 when not admin (requireAdminSession throws ApiError 401)", async () => {
    mockRequireAdmin.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));

    const res = await PATCH(makeRequest(POST_ID, { isPinned: true }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid postId", async () => {
    const res = await PATCH(makeRequest("not-a-uuid", { isPinned: true }));
    expect(res.status).toBe(400);
  });

  it("returns 422 for missing isPinned body", async () => {
    const res = await PATCH(makeRequest(POST_ID, {}));
    expect(res.status).toBe(422);
  });

  it("returns 422 for non-boolean isPinned", async () => {
    const res = await PATCH(makeRequest(POST_ID, { isPinned: "yes" }));
    expect(res.status).toBe(422);
  });

  it("returns 404 when post not found", async () => {
    // select returns empty — post not found
    mockDb.select.mockReturnValue(makeSelectChain([]));

    const res = await PATCH(makeRequest(POST_ID, { isPinned: true }));
    expect(res.status).toBe(404);
  });

  it("returns { postId, isPinned: true } on successful pin", async () => {
    mockDb.select.mockReturnValue(makeSelectChain([{ id: POST_ID }]));
    mockDb.update.mockReturnValue(makeUpdateChain());

    const res = await PATCH(makeRequest(POST_ID, { isPinned: true }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown };
    expect(body.data).toEqual({ postId: POST_ID, isPinned: true });
  });

  it("returns { postId, isPinned: false } on successful unpin", async () => {
    mockDb.select.mockReturnValue(makeSelectChain([{ id: POST_ID }]));
    mockDb.update.mockReturnValue(makeUpdateChain());

    const res = await PATCH(makeRequest(POST_ID, { isPinned: false }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown };
    expect(body.data).toEqual({ postId: POST_ID, isPinned: false });
  });
});
