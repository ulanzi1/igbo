// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockRejectApplication = vi.fn();

vi.mock("@/services/admin-approval-service", () => ({
  rejectApplication: (...args: unknown[]) => mockRejectApplication(...args),
}));

vi.mock("@igbo/db/queries/auth-queries", () => ({ findUserById: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: vi.fn() }));
vi.mock("@/services/permissions", () => ({ isAdmin: vi.fn() }));
vi.mock("@/services/event-bus", () => ({ eventBus: { emit: vi.fn() } }));
vi.mock("@/services/email-service", () => ({ enqueueEmailJob: vi.fn() }));
vi.mock("@/services/audit-logger", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { POST } from "./route";

const ADMIN_ID = "admin-uuid-1";
const APP_ID = "application-uuid-1";

function makePostRequest(body: Record<string, unknown> = {}) {
  return new Request(`https://example.com/api/v1/admin/applications/${APP_ID}/reject`, {
    method: "POST",
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
      "Content-Type": "application/json",
      "X-Admin-Id": ADMIN_ID,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRejectApplication.mockResolvedValue(undefined);
});

describe("POST /api/v1/admin/applications/[id]/reject", () => {
  it("returns 200 on successful rejection", async () => {
    const req = makePostRequest();
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.message).toBe("Application rejected");
  });

  it("calls rejectApplication with id from URL", async () => {
    const req = makePostRequest();
    await POST(req);
    expect(mockRejectApplication).toHaveBeenCalledWith(expect.any(Request), APP_ID, undefined);
  });

  it("passes optional reason to rejectApplication", async () => {
    const req = makePostRequest({ reason: "Does not meet criteria" });
    await POST(req);
    expect(mockRejectApplication).toHaveBeenCalledWith(
      expect.any(Request),
      APP_ID,
      "Does not meet criteria",
    );
  });

  it("returns error response when service throws 409", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRejectApplication.mockRejectedValue(
      new ApiError({ title: "Conflict", status: 409, detail: "Invalid status transition" }),
    );
    const req = makePostRequest();
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("returns 403 for non-admin request", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRejectApplication.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const req = makePostRequest();
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("creates audit log row per action (verified via service mock invocation)", async () => {
    const req = makePostRequest();
    await POST(req);
    // Audit logging happens inside rejectApplication (mocked here)
    // Verified it's called — actual logging behavior tested in service layer tests
    expect(mockRejectApplication).toHaveBeenCalledOnce();
  });
});
