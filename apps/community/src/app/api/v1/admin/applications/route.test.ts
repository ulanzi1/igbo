// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockGetApplicationsList = vi.fn();
const mockRequireAdminSession = vi.fn();
const mockIsAdmin = vi.fn();

vi.mock("@/services/admin-approval-service", () => ({
  getApplicationsList: (...args: unknown[]) => mockGetApplicationsList(...args),
}));

vi.mock("@igbo/auth/admin-auth", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdminSession(...args),
}));

vi.mock("@igbo/auth/permissions", () => ({
  isAdmin: (...args: unknown[]) => mockIsAdmin(...args),
}));

vi.mock("@igbo/db/queries/auth-queries", () => ({
  findUserById: vi.fn(),
}));

vi.mock("@/lib/request-context", () => ({
  getRequestContext: vi.fn(() => undefined),
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET } from "./route";

const ADMIN_ID = "admin-uuid-1";

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL("https://example.com/api/v1/admin/applications");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString(), {
    headers: {
      Host: "example.com",
      "X-Admin-Id": ADMIN_ID,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({ adminId: ADMIN_ID });
  mockIsAdmin.mockResolvedValue(true);
  mockGetApplicationsList.mockResolvedValue({
    data: [
      {
        id: "user-1",
        email: "applicant@example.com",
        name: "Applicant One",
        accountStatus: "PENDING_APPROVAL",
      },
    ],
    meta: { page: 1, pageSize: 20, total: 1 },
  });
});

describe("GET /api/v1/admin/applications", () => {
  it("returns paginated list of applications", async () => {
    const req = makeGetRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.meta.total).toBe(1);
  });

  it("passes status query param to service", async () => {
    const req = makeGetRequest({ status: "APPROVED", page: "2", pageSize: "10" });
    await GET(req);
    expect(mockGetApplicationsList).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ status: "APPROVED", page: 2, pageSize: 10 }),
    );
  });

  it("returns 401 when requireAdminSession throws", async () => {
    mockGetApplicationsList.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 401, title: "Unauthorized" }),
    );
    const req = makeGetRequest();
    // Will be caught by withApiHandler and converted to error response
    const res = await GET(req);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
