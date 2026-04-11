// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-applications", () => ({
  getApplicationsWithSeekerDataByJobId: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingById: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyByOwnerId: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { getApplicationsWithSeekerDataByJobId } from "@igbo/db/queries/portal-applications";
import { getJobPostingById } from "@igbo/db/queries/portal-job-postings";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { GET } from "./route";

const VALID_JOB_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const EMPLOYER_ID = "employer-1";
const COMPANY_ID = "cp-1";

const employerSession = {
  user: { id: EMPLOYER_ID, activePortalRole: "EMPLOYER" },
};

const mockPosting = {
  id: VALID_JOB_ID,
  companyId: COMPANY_ID,
} as Awaited<ReturnType<typeof getJobPostingById>>;

const mockCompany = {
  id: COMPANY_ID,
  ownerUserId: EMPLOYER_ID,
} as unknown as Awaited<ReturnType<typeof getCompanyByOwnerId>>;

const mockApplications = [
  {
    id: "app-1",
    jobId: VALID_JOB_ID,
    seekerUserId: "seeker-1",
    status: "submitted",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    coverLetterText: null,
    portfolioLinksJson: [],
    selectedCvId: null,
    seekerName: "Alice",
    seekerHeadline: "Engineer",
    seekerProfileId: "sp-1",
    seekerSkills: ["ts"],
  },
];

function makeRequest(jobId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/jobs/${jobId}/applications`, {
    method: "GET",
    headers: {
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
  vi.mocked(getJobPostingById).mockResolvedValue(mockPosting);
  vi.mocked(getCompanyByOwnerId).mockResolvedValue(mockCompany);
  vi.mocked(getApplicationsWithSeekerDataByJobId).mockResolvedValue(
    mockApplications as unknown as Awaited<ReturnType<typeof getApplicationsWithSeekerDataByJobId>>,
  );
});

describe("GET /api/v1/jobs/[jobId]/applications", () => {
  it("returns 200 with applications list", async () => {
    const res = await GET(makeRequest(VALID_JOB_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.applications).toHaveLength(1);
    expect(body.data.applications[0].seekerName).toBe("Alice");
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET(makeRequest(VALID_JOB_ID));
    expect(res.status).toBe(401);
    expect(getApplicationsWithSeekerDataByJobId).not.toHaveBeenCalled();
  });

  it("returns 403 when role is not EMPLOYER", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "seeker-1", activePortalRole: "JOB_SEEKER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    const res = await GET(makeRequest(VALID_JOB_ID));
    expect(res.status).toBe(403);
    expect(getApplicationsWithSeekerDataByJobId).not.toHaveBeenCalled();
  });

  it("returns 400 when jobId is not a valid UUID", async () => {
    const res = await GET(makeRequest("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(getJobPostingById).not.toHaveBeenCalled();
  });

  it("returns 404 when job posting not found", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue(null);
    const res = await GET(makeRequest(VALID_JOB_ID));
    expect(res.status).toBe(404);
    expect(getApplicationsWithSeekerDataByJobId).not.toHaveBeenCalled();
  });

  it("returns 404 when employer has no company", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
    const res = await GET(makeRequest(VALID_JOB_ID));
    expect(res.status).toBe(404);
    expect(getApplicationsWithSeekerDataByJobId).not.toHaveBeenCalled();
  });

  it("returns 404 when employer does not own the job", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue({
      ...(mockCompany as { id: string }),
      id: "different-company",
    } as unknown as Awaited<ReturnType<typeof getCompanyByOwnerId>>);
    const res = await GET(makeRequest(VALID_JOB_ID));
    expect(res.status).toBe(404);
    expect(getApplicationsWithSeekerDataByJobId).not.toHaveBeenCalled();
  });

  it("returns 200 with empty array when no applications exist", async () => {
    vi.mocked(getApplicationsWithSeekerDataByJobId).mockResolvedValue([]);
    const res = await GET(makeRequest(VALID_JOB_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.applications).toEqual([]);
  });
});
