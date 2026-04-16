// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({ requireJobAdminRole: vi.fn() }));
vi.mock("@igbo/db/queries/portal-employer-verifications", () => ({
  listPendingVerifications: vi.fn(),
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import { listPendingVerifications } from "@igbo/db/queries/portal-employer-verifications";
import { ApiError } from "@igbo/auth/api-error";
import { GET } from "./route";

const mockItem = {
  id: "ver-1",
  companyId: "company-1",
  companyName: "Acme Corp",
  ownerUserName: "Jane",
  ownerUserId: "employer-1",
  documentCount: 2,
  submittedAt: new Date("2026-04-10"),
  status: "pending",
};

function makeRequest(params = ""): Request {
  return new Request(`https://jobs.igbo.com/api/v1/admin/verifications${params}`, {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireJobAdminRole).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
});

describe("GET /api/v1/admin/verifications", () => {
  it("returns pending verifications with default pagination", async () => {
    vi.mocked(listPendingVerifications).mockResolvedValue({ items: [mockItem], total: 1 });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.total).toBe(1);
    expect(listPendingVerifications).toHaveBeenCalledWith({ limit: 50, offset: 0 });
  });

  it("passes custom limit and offset from query params", async () => {
    vi.mocked(listPendingVerifications).mockResolvedValue({ items: [], total: 0 });
    const res = await GET(makeRequest("?limit=10&offset=20"));
    expect(res.status).toBe(200);
    expect(listPendingVerifications).toHaveBeenCalledWith({ limit: 10, offset: 20 });
  });

  it("caps limit at 100", async () => {
    vi.mocked(listPendingVerifications).mockResolvedValue({ items: [], total: 0 });
    await GET(makeRequest("?limit=999"));
    expect(listPendingVerifications).toHaveBeenCalledWith({ limit: 100, offset: 0 });
  });

  it("returns empty list when no pending verifications", async () => {
    vi.mocked(listPendingVerifications).mockResolvedValue({ items: [], total: 0 });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(0);
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });
});
