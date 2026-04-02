// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockApproveApplication = vi.fn();
const mockGetApplicationById = vi.fn();
const mockRequireAdminSession = vi.fn();
const mockIsAdmin = vi.fn();
const mockLogAdminAction = vi.fn();
const mockEnqueueEmailJob = vi.fn();

vi.mock("@/services/admin-approval-service", () => ({
  approveApplication: (...args: unknown[]) => mockApproveApplication(...args),
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdminSession(...args),
}));

vi.mock("@/services/permissions", () => ({
  isAdmin: (...args: unknown[]) => mockIsAdmin(...args),
}));

vi.mock("@igbo/db/queries/admin-approvals", () => ({
  getApplicationById: (...args: unknown[]) => mockGetApplicationById(...args),
  updateApplicationStatus: vi.fn(),
  listApplications: vi.fn(),
}));

vi.mock("@/services/audit-logger", () => ({
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
}));

vi.mock("@/services/email-service", () => ({
  enqueueEmailJob: (...args: unknown[]) => mockEnqueueEmailJob(...args),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock("@igbo/db/queries/auth-queries", () => ({
  findUserById: vi.fn(),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { POST } from "./route";

const ADMIN_ID = "admin-uuid-1";
const APP_ID = "application-uuid-1";

function makePostRequest() {
  return new Request(`https://example.com/api/v1/admin/applications/${APP_ID}/approve`, {
    method: "POST",
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
      "X-Admin-Id": ADMIN_ID,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApproveApplication.mockResolvedValue(undefined);
});

describe("POST /api/v1/admin/applications/[id]/approve", () => {
  it("returns 200 on successful approval", async () => {
    const req = makePostRequest();
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.message).toBe("Application approved");
  });

  it("calls approveApplication with the correct id from URL", async () => {
    const req = makePostRequest();
    await POST(req);
    expect(mockApproveApplication).toHaveBeenCalledWith(expect.any(Request), APP_ID);
  });

  it("returns error response when approveApplication throws", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockApproveApplication.mockRejectedValue(
      new ApiError({ title: "Not Found", status: 404, detail: "Application not found" }),
    );
    const req = makePostRequest();
    const res = await POST(req);
    expect(res.status).toBe(404);
  });
});
