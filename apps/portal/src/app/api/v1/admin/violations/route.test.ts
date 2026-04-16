// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({
  requireJobAdminRole: vi.fn(),
}));
vi.mock("@/services/admin-review-service", () => ({
  getViolationsQueue: vi.fn(),
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import { getViolationsQueue } from "@/services/admin-review-service";
import { ApiError } from "@igbo/auth/api-error";
import { GET } from "./route";

const mockFlag = {
  id: "flag-1",
  postingId: "posting-1",
  adminUserId: "admin-1",
  category: "discriminatory_language" as const,
  severity: "high",
  description: "The posting contains discriminatory language targeting applicants.",
  status: "open" as const,
  autoPaused: true,
  resolvedAt: null,
  resolvedByUserId: null,
  resolutionAction: null,
  resolutionNote: null,
  createdAt: new Date("2026-04-01"),
  postingTitle: "Software Engineer",
  companyName: "Tech Corp",
  companyId: "company-1",
};

function makeRequest(params = ""): Request {
  return new Request(`https://jobs.igbo.com/api/v1/admin/violations${params}`, {
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

describe("GET /api/v1/admin/violations", () => {
  it("returns violations list with default pagination", async () => {
    vi.mocked(getViolationsQueue).mockResolvedValue({ items: [mockFlag], total: 1 });

    const req = makeRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.total).toBe(1);
    expect(getViolationsQueue).toHaveBeenCalledWith({ limit: 50, offset: 0, companyId: undefined });
  });

  it("passes custom limit and offset from query params", async () => {
    vi.mocked(getViolationsQueue).mockResolvedValue({ items: [], total: 0 });

    const req = makeRequest("?limit=10&offset=20");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(getViolationsQueue).toHaveBeenCalledWith({
      limit: 10,
      offset: 20,
      companyId: undefined,
    });
  });

  it("caps limit at 100", async () => {
    vi.mocked(getViolationsQueue).mockResolvedValue({ items: [], total: 0 });

    const req = makeRequest("?limit=999");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(getViolationsQueue).toHaveBeenCalledWith({
      limit: 100,
      offset: 0,
      companyId: undefined,
    });
  });

  it("returns empty list when no open flags", async () => {
    vi.mocked(getViolationsQueue).mockResolvedValue({ items: [], total: 0 });

    const req = makeRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(0);
    expect(body.data.total).toBe(0);
  });

  it("passes companyId query param to getViolationsQueue", async () => {
    vi.mocked(getViolationsQueue).mockResolvedValue({ items: [mockFlag], total: 1 });

    const req = makeRequest("?companyId=company-1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(getViolationsQueue).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      companyId: "company-1",
    });
  });

  it("omits companyId when not in query params (backward compatible)", async () => {
    vi.mocked(getViolationsQueue).mockResolvedValue({ items: [], total: 0 });

    const req = makeRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(getViolationsQueue).toHaveBeenCalledWith({ limit: 50, offset: 0, companyId: undefined });
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );

    const req = makeRequest();
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});
