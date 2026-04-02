// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAdminSession = vi.fn();
const mockGetAllPointsRules = vi.fn();
const mockUpdatePointsRule = vi.fn();
const mockLogAdminAction = vi.fn();

vi.mock("@/lib/admin-auth", () => ({
  requireAdminSession: (...a: unknown[]) => mockRequireAdminSession(...a),
}));

vi.mock("@/db/queries/points", () => ({
  getAllPointsRules: (...a: unknown[]) => mockGetAllPointsRules(...a),
  updatePointsRule: (...a: unknown[]) => mockUpdatePointsRule(...a),
}));

vi.mock("@/services/audit-logger", () => ({
  logAdminAction: (...a: unknown[]) => mockLogAdminAction(...a),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET, PATCH } from "./route";

const sampleRule = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  activityType: "like_received",
  basePoints: 1,
  isActive: true,
  description: "Points for receiving a like",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeRequest(method: string, body?: unknown) {
  return new Request("https://example.com/api/v1/admin/points-rules", {
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
  mockGetAllPointsRules.mockResolvedValue([sampleRule]);
  mockUpdatePointsRule.mockResolvedValue(sampleRule);
  mockLogAdminAction.mockResolvedValue(undefined);
});

describe("GET /api/v1/admin/points-rules", () => {
  it("returns 200 with all rules", async () => {
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.rules).toHaveLength(1);
    expect(body.data.rules[0].activityType).toBe("like_received");
  });

  it("returns 403 when not admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/v1/admin/points-rules", () => {
  it("returns 200 and calls updatePointsRule with correct args", async () => {
    const res = await PATCH(
      makeRequest("PATCH", {
        id: "550e8400-e29b-41d4-a716-446655440000",
        basePoints: 3,
      }),
    );
    expect(res.status).toBe(200);
    expect(mockUpdatePointsRule).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000", {
      basePoints: 3,
    });
  });

  it("logs SETTINGS_UPDATED with entity=points_rule and actorId", async () => {
    await PATCH(
      makeRequest("PATCH", {
        id: "550e8400-e29b-41d4-a716-446655440000",
        isActive: false,
      }),
    );
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        action: "SETTINGS_UPDATED",
        details: expect.objectContaining({ entity: "points_rule" }),
      }),
    );
  });

  it("returns 400 for invalid UUID id", async () => {
    const res = await PATCH(makeRequest("PATCH", { id: "not-a-uuid", basePoints: 3 }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when rule not found", async () => {
    mockUpdatePointsRule.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("PATCH", {
        id: "550e8400-e29b-41d4-a716-446655440000",
        basePoints: 3,
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when not admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const res = await PATCH(
      makeRequest("PATCH", { id: "550e8400-e29b-41d4-a716-446655440000", basePoints: 3 }),
    );
    expect(res.status).toBe(403);
  });
});
