// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/portal-permissions", () => ({
  requireEmployerRole: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyByOwnerId: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-applications", () => ({
  getApplicationsForEmployer: vi.fn(),
}));

import { requireEmployerRole } from "@/lib/portal-permissions";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { getApplicationsForEmployer } from "@igbo/db/queries/portal-applications";
import { GET } from "./route";

const employerSession = {
  user: { id: "user-1", activePortalRole: "EMPLOYER" },
};

const mockCompany = { id: "company-1", name: "Acme Corp" };

const mockApplications = [
  {
    id: "app-1",
    jobId: "jp-1",
    seekerUserId: "seeker-1",
    status: "submitted",
    createdAt: new Date("2026-01-15"),
  },
  {
    id: "app-2",
    jobId: "jp-2",
    seekerUserId: "seeker-2",
    status: "under_review",
    createdAt: new Date("2026-01-16"),
  },
];

function makeRequest(query = ""): Request {
  const url = `https://jobs.igbo.com/api/v1/applications${query ? `?${query}` : ""}`;
  return new Request(url, {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireEmployerRole).mockResolvedValue(
    employerSession as ReturnType<typeof requireEmployerRole> extends Promise<infer T> ? T : never,
  );
  vi.mocked(getCompanyByOwnerId).mockResolvedValue(mockCompany as never);
  vi.mocked(getApplicationsForEmployer).mockResolvedValue({
    applications: mockApplications,
    total: 2,
  } as never);
});

describe("GET /api/v1/applications", () => {
  it("returns 401 when requireEmployerRole throws (not authenticated)", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(requireEmployerRole).mockRejectedValue(
      new ApiError({ title: "Authentication required", status: 401 }),
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 when requireEmployerRole throws (not employer)", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(requireEmployerRole).mockRejectedValue(
      new ApiError({ title: "Employer role required", status: 403 }),
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 404 when getCompanyByOwnerId returns null", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null as never);
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });

  it("returns 200 with applications data on valid request", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.applications).toHaveLength(2);
    expect(body.data.total).toBe(2);
    expect(body.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
  });

  it("maps status filter param to correct DB statuses", async () => {
    await GET(makeRequest("status=inReview"));
    expect(getApplicationsForEmployer).toHaveBeenCalledWith("company-1", {
      statusFilter: ["under_review", "shortlisted"],
      sortBy: undefined,
      sortOrder: undefined,
      page: 1,
      pageSize: 20,
    });
  });

  it("returns 400 for invalid sortBy param", async () => {
    const res = await GET(makeRequest("sortBy=invalid_field"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for pageSize > 50", async () => {
    const res = await GET(makeRequest("pageSize=100"));
    expect(res.status).toBe(400);
  });

  it("uses default pagination when no params provided", async () => {
    await GET(makeRequest());
    expect(getApplicationsForEmployer).toHaveBeenCalledWith("company-1", {
      statusFilter: undefined,
      sortBy: undefined,
      sortOrder: undefined,
      page: 1,
      pageSize: 20,
    });
  });
});
