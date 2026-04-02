// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAdminSession = vi.fn();
const mockSearchMembersForAdmin = vi.fn();

vi.mock("@igbo/auth/admin-auth", () => ({
  requireAdminSession: (...a: unknown[]) => mockRequireAdminSession(...a),
}));

vi.mock("@igbo/db/queries/points", () => ({
  searchMembersForAdmin: (...a: unknown[]) => mockSearchMembersForAdmin(...a),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET } from "./route";

function makeRequest(searchParams: Record<string, string> = {}) {
  const url = new URL("https://example.com/api/v1/admin/members/search");
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString(), {
    method: "GET",
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({ adminId: "admin-1" });
  mockSearchMembersForAdmin.mockResolvedValue([]);
});

describe("GET /api/v1/admin/members/search", () => {
  it("returns 401 when unauthenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Unauthorized", status: 401 }));
    const res = await GET(makeRequest({ q: "alice" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when non-admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const res = await GET(makeRequest({ q: "alice" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when q is less than 2 characters", async () => {
    const res = await GET(makeRequest({ q: "a" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when q param is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns 200 with results on successful search", async () => {
    mockSearchMembersForAdmin.mockResolvedValue([
      { userId: "user-1", displayName: "Alice", email: "alice@example.com" },
    ]);
    const res = await GET(makeRequest({ q: "alice" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.results).toHaveLength(1);
    expect(body.data.results[0].userId).toBe("user-1");
  });

  it("returns 200 with empty results array when no matches", async () => {
    mockSearchMembersForAdmin.mockResolvedValue([]);
    const res = await GET(makeRequest({ q: "zzz" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.results).toEqual([]);
  });

  it("calls searchMembersForAdmin with correct query and limit", async () => {
    await GET(makeRequest({ q: "alice" }));
    expect(mockSearchMembersForAdmin).toHaveBeenCalledWith("alice", 10);
  });
});
