// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/portal-permissions", () => ({
  requireEmployerRole: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-applications", () => ({
  getApplicationsWithSeekerDataByJobId: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyByOwnerId: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingById: vi.fn(),
}));

import { requireEmployerRole } from "@/lib/portal-permissions";
import { getApplicationsWithSeekerDataByJobId } from "@igbo/db/queries/portal-applications";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { getJobPostingById } from "@igbo/db/queries/portal-job-postings";
import { GET } from "./route";

type EmployerSession = { user: { id: string; activePortalRole: string } };
const employerSession: EmployerSession = {
  user: { id: "employer-1", activePortalRole: "EMPLOYER" },
};

const mockCompany = { id: "company-1", ownerUserId: "employer-1", name: "Acme Corp" };
const mockPosting = { id: "jp-1", companyId: "company-1", title: "Engineer", status: "active" };

const mockApplications = [
  {
    id: "app-1",
    jobId: "jp-1",
    seekerUserId: "u-1",
    status: "submitted",
    createdAt: new Date("2026-01-01"),
    coverLetterText: null,
    portfolioLinksJson: [],
    selectedCvId: null,
    seekerName: "Ada Okafor",
    seekerHeadline: "Senior Engineer",
    seekerProfileId: "sp-1",
    seekerSkills: [],
  },
];

const JOB_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

function makeGetRequest(jobId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/jobs/${jobId}/applications`, {
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
  vi.mocked(getJobPostingById).mockResolvedValue(mockPosting as never);
  vi.mocked(getApplicationsWithSeekerDataByJobId).mockResolvedValue(mockApplications as never);
});

describe("GET /api/v1/jobs/[jobId]/applications", () => {
  it("returns 200 with applications list", async () => {
    const res = await GET(makeGetRequest(JOB_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.applications).toHaveLength(1);
    expect(body.data.applications[0].seekerName).toBe("Ada Okafor");
  });

  it("returns empty array when job has no applications", async () => {
    vi.mocked(getApplicationsWithSeekerDataByJobId).mockResolvedValue([]);
    const res = await GET(makeGetRequest(JOB_ID));
    const body = await res.json();
    expect(body.data.applications).toHaveLength(0);
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(requireEmployerRole).mockRejectedValue(
      new ApiError({ title: "Authentication required", status: 401 }),
    );
    const res = await GET(makeGetRequest(JOB_ID));
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not EMPLOYER", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(requireEmployerRole).mockRejectedValue(
      new ApiError({ title: "Employer role required", status: 403 }),
    );
    const res = await GET(makeGetRequest(JOB_ID));
    expect(res.status).toBe(403);
  });

  it("returns 404 when employer has no company profile", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
    const res = await GET(makeGetRequest(JOB_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when job posting not found", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue(null);
    const res = await GET(makeGetRequest(JOB_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when job belongs to different company", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({
      ...mockPosting,
      companyId: "other-company",
    } as never);
    const res = await GET(makeGetRequest(JOB_ID));
    expect(res.status).toBe(404);
  });

  it("calls getApplicationsWithSeekerDataByJobId with the jobId", async () => {
    await GET(makeGetRequest(JOB_ID));
    expect(getApplicationsWithSeekerDataByJobId).toHaveBeenCalledWith(JOB_ID);
  });
});
