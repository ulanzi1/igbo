// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAdminSession = vi.fn();
const mockGetPlatformSetting = vi.fn();
const mockUpsertPlatformSetting = vi.fn();
const mockLogAdminAction = vi.fn();

vi.mock("@/lib/admin-auth", () => ({
  requireAdminSession: (...a: unknown[]) => mockRequireAdminSession(...a),
}));

vi.mock("@/db/queries/platform-settings", () => ({
  getPlatformSetting: (...a: unknown[]) => mockGetPlatformSetting(...a),
  upsertPlatformSetting: (...a: unknown[]) => mockUpsertPlatformSetting(...a),
}));

vi.mock("@/services/audit-logger", () => ({
  logAdminAction: (...a: unknown[]) => mockLogAdminAction(...a),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET, PUT } from "./route";

function makeRequest(method: string, body?: unknown) {
  return new Request("https://example.com/api/v1/admin/daily-cap", {
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
  mockGetPlatformSetting.mockResolvedValue(100);
  mockUpsertPlatformSetting.mockResolvedValue(undefined);
  mockLogAdminAction.mockResolvedValue(undefined);
});

describe("GET /api/v1/admin/daily-cap", () => {
  it("returns 200 with current daily cap value", async () => {
    mockGetPlatformSetting.mockResolvedValue(150);
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.value).toBe(150);
  });

  it("returns fallback value of 100 when setting not set", async () => {
    mockGetPlatformSetting.mockResolvedValue(100);
    const res = await GET(makeRequest("GET"));
    const body = await res.json();
    expect(body.data.value).toBe(100);
  });

  it("returns 403 when not admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/v1/admin/daily-cap", () => {
  it("upserts platform setting and logs audit with correct actorId", async () => {
    const res = await PUT(makeRequest("PUT", { value: 200 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.value).toBe(200);
    expect(mockUpsertPlatformSetting).toHaveBeenCalledWith("daily_cap_points", 200, "admin-1");
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        action: "SETTINGS_UPDATED",
        details: expect.objectContaining({ entity: "daily_cap", changes: { value: 200 } }),
      }),
    );
  });

  it("returns 400 for value below minimum (0)", async () => {
    const res = await PUT(makeRequest("PUT", { value: 0 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing value field", async () => {
    const res = await PUT(makeRequest("PUT", {}));
    expect(res.status).toBe(400);
  });

  it("returns 403 when not admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const res = await PUT(makeRequest("PUT", { value: 200 }));
    expect(res.status).toBe(403);
  });
});
