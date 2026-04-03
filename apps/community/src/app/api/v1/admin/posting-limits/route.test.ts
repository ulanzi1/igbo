// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAdminSession = vi.fn();
const mockGetAllPostingLimits = vi.fn();
const mockUpdatePostingLimit = vi.fn();
const mockLogAdminAction = vi.fn();

vi.mock("@igbo/auth/admin-auth", () => ({
  requireAdminSession: (...a: unknown[]) => mockRequireAdminSession(...a),
}));

vi.mock("@igbo/db/queries/points", () => ({
  getAllPostingLimits: (...a: unknown[]) => mockGetAllPostingLimits(...a),
  updatePostingLimit: (...a: unknown[]) => mockUpdatePostingLimit(...a),
}));

vi.mock("@/services/audit-logger", () => ({
  logAdminAction: (...a: unknown[]) => mockLogAdminAction(...a),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET, PATCH } from "./route";

const sampleLimit = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  tier: "PROFESSIONAL",
  baseLimit: 1,
  bonusLimit: 1,
  pointsThreshold: 500,
};

function makeRequest(method: string, body?: unknown) {
  return new Request("https://example.com/api/v1/admin/posting-limits", {
    method,
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({ adminId: "admin-1" });
  mockGetAllPostingLimits.mockResolvedValue([sampleLimit]);
  mockUpdatePostingLimit.mockResolvedValue(sampleLimit);
  mockLogAdminAction.mockResolvedValue(undefined);
});

describe("GET /api/v1/admin/posting-limits", () => {
  it("returns 200 with all posting limits", async () => {
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.limits).toHaveLength(1);
    expect(body.data.limits[0].tier).toBe("PROFESSIONAL");
  });

  it("returns 403 when not admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/v1/admin/posting-limits", () => {
  it("returns 200 and calls updatePostingLimit with correct args", async () => {
    const res = await PATCH(
      makeRequest("PATCH", {
        id: "550e8400-e29b-41d4-a716-446655440001",
        baseLimit: 2,
        bonusLimit: 2,
        pointsThreshold: 1000,
      }),
    );
    expect(res.status).toBe(200);
    expect(mockUpdatePostingLimit).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440001", {
      baseLimit: 2,
      bonusLimit: 2,
      pointsThreshold: 1000,
    });
  });

  it("logs SETTINGS_UPDATED with entity=posting_limit, tier, and actorId", async () => {
    await PATCH(
      makeRequest("PATCH", {
        id: "550e8400-e29b-41d4-a716-446655440001",
        bonusLimit: 3,
      }),
    );
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        action: "SETTINGS_UPDATED",
        details: expect.objectContaining({ entity: "posting_limit", tier: "PROFESSIONAL" }),
      }),
    );
  });

  it("returns 400 for invalid UUID id", async () => {
    const res = await PATCH(makeRequest("PATCH", { id: "bad-id", bonusLimit: 1 }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when posting limit not found", async () => {
    mockUpdatePostingLimit.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("PATCH", {
        id: "550e8400-e29b-41d4-a716-446655440001",
        baseLimit: 2,
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when not admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const res = await PATCH(
      makeRequest("PATCH", {
        id: "550e8400-e29b-41d4-a716-446655440001",
        baseLimit: 2,
      }),
    );
    expect(res.status).toBe(403);
  });
});
