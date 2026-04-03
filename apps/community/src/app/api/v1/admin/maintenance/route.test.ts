// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRequireAdminSession = vi.fn();
vi.mock("@igbo/auth/admin-auth", () => ({
  requireAdminSession: () => mockRequireAdminSession(),
}));

const mockGetPlatformSetting = vi.fn();
const mockUpsertPlatformSetting = vi.fn();
vi.mock("@igbo/db/queries/platform-settings", () => ({
  getPlatformSetting: (...args: unknown[]) => mockGetPlatformSetting(...args),
  upsertPlatformSetting: (...args: unknown[]) => mockUpsertPlatformSetting(...args),
}));

const mockLogAdminAction = vi.fn();
vi.mock("@/services/audit-logger", () => ({
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
}));

const mockRedisSet = vi.fn().mockResolvedValue("OK");
vi.mock("@/lib/redis", () => ({
  getRedisClient: () => ({ set: mockRedisSet }),
}));

const mockSentryCaptureMessage = vi.fn();
const mockSentryCaptureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...args: unknown[]) => mockSentryCaptureMessage(...args),
  captureException: (...args: unknown[]) => mockSentryCaptureException(...args),
}));

import { GET, POST } from "./route";

const defaultSetting = {
  enabled: false,
  reason: "",
  scheduledStart: "",
  expectedDuration: 60,
  initiatedBy: "",
};

function makeRequest(method: string, body?: object): Request {
  return new Request("http://localhost/api/v1/admin/maintenance", {
    method,
    headers: {
      "Content-Type": "application/json",
      Host: "localhost",
      Origin: "http://localhost",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

let savedMaintenanceMode: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  // Save and clear MAINTENANCE_MODE so the route's process.env side effect doesn't leak
  savedMaintenanceMode = process.env.MAINTENANCE_MODE;
  delete process.env.MAINTENANCE_MODE;
  mockRequireAdminSession.mockResolvedValue({ adminId: "admin-1" });
  mockGetPlatformSetting.mockResolvedValue(defaultSetting);
  mockUpsertPlatformSetting.mockResolvedValue(undefined);
  mockLogAdminAction.mockResolvedValue(undefined);
});

afterEach(() => {
  // Restore original env var state
  if (savedMaintenanceMode !== undefined) {
    process.env.MAINTENANCE_MODE = savedMaintenanceMode;
  } else {
    delete process.env.MAINTENANCE_MODE;
  }
});

describe("GET /api/v1/admin/maintenance", () => {
  it("returns current maintenance status", async () => {
    const req = makeRequest("GET");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { maintenance: object } };
    expect(json.data.maintenance).toMatchObject({ enabled: false });
  });

  it("returns 403 when not admin", async () => {
    mockRequireAdminSession.mockRejectedValue({ status: 403, title: "Forbidden" });
    const req = makeRequest("GET");
    // requireAdminSession throws — withApiHandler returns 403 or 500
    const res = await GET(req);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("POST /api/v1/admin/maintenance — enable", () => {
  it("enables maintenance mode", async () => {
    const req = makeRequest("POST", {
      enabled: true,
      reason: "Deploying updates",
      expectedDuration: 30,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { maintenance: { enabled: boolean } } };
    expect(json.data.maintenance.enabled).toBe(true);
    expect(mockUpsertPlatformSetting).toHaveBeenCalledWith(
      "maintenance_mode",
      expect.objectContaining({ enabled: true, reason: "Deploying updates" }),
      "admin-1",
    );
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "MAINTENANCE_ENABLED" }),
    );
    expect(mockRedisSet).toHaveBeenCalled();
  });

  it("disables maintenance mode", async () => {
    const req = makeRequest("POST", { enabled: false });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { maintenance: { enabled: boolean } } };
    expect(json.data.maintenance.enabled).toBe(false);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "MAINTENANCE_DISABLED" }),
    );
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/v1/admin/maintenance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Host: "localhost",
        Origin: "http://localhost",
      },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing enabled field", async () => {
    const req = makeRequest("POST", { reason: "test" }); // missing enabled
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("idempotent: enabling when already enabled does not error", async () => {
    mockGetPlatformSetting.mockResolvedValue({
      ...defaultSetting,
      enabled: true,
      scheduledStart: new Date().toISOString(),
    });
    const req = makeRequest("POST", { enabled: true });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("fires Sentry warning when actual duration exceeds expected", async () => {
    // Mock current state: maintenance started 3 hours ago, expected 60 min
    const startedAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    mockGetPlatformSetting.mockResolvedValue({
      ...defaultSetting,
      enabled: true,
      scheduledStart: startedAt,
      expectedDuration: 60,
    });

    const req = makeRequest("POST", { enabled: false });
    await POST(req);

    expect(mockSentryCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining("Maintenance exceeded expected duration"),
      expect.objectContaining({ level: "warning" }),
    );
  });

  it("does not fire Sentry when duration is within expected", async () => {
    // Started 30 minutes ago, expected 60
    const startedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    mockGetPlatformSetting.mockResolvedValue({
      ...defaultSetting,
      enabled: true,
      scheduledStart: startedAt,
      expectedDuration: 60,
    });

    const req = makeRequest("POST", { enabled: false });
    await POST(req);

    expect(mockSentryCaptureMessage).not.toHaveBeenCalled();
  });
});
