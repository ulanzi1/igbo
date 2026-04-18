// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/db/queries/portal-job-postings");
vi.mock("@/services/job-search-service");

import { getJobPostingWithCompany } from "@igbo/db/queries/portal-job-postings";
import { getSimilarJobs } from "@/services/job-search-service";
import { GET } from "./route";

const mockGetJobPostingWithCompany = vi.mocked(getJobPostingWithCompany);
const mockGetSimilarJobs = vi.mocked(getSimilarJobs);

function makeRequest(jobId: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://jobs.igbo.com/api/v1/jobs/${jobId}/similar`, {
    method: "GET",
    headers: { ...headers },
  });
}

const activePosting = {
  id: "job-uuid-1",
  status: "active" as const,
  requirements: "React TypeScript",
  location: "Lagos, Nigeria",
  companyId: "company-1",
};

const techCompany = {
  id: "company-1",
  industry: "Technology",
};

const similarJob = {
  id: "similar-1",
  title: "Frontend Developer",
  company_name: "OtherCorp",
  company_id: "company-2",
  logo_url: null,
  location: "Lagos, Nigeria",
  salary_min: 60000,
  salary_max: 90000,
  salary_competitive_only: false,
  employment_type: "full_time",
  cultural_context_json: null,
  application_deadline: null,
  created_at: "2026-04-10T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/jobs/[jobId]/similar", () => {
  it("returns 404 when posting not found", async () => {
    mockGetJobPostingWithCompany.mockResolvedValue(null);

    const res = await GET(makeRequest("nonexistent-id"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for draft/pending_review/paused/rejected postings", async () => {
    for (const status of ["draft", "pending_review", "paused", "rejected"] as const) {
      mockGetJobPostingWithCompany.mockResolvedValue({
        posting: { ...activePosting, status },
        company: techCompany,
      } as never);

      const res = await GET(makeRequest("job-uuid-1"));
      expect(res.status, `Expected 404 for status: ${status}`).toBe(404);
    }
  });

  it("returns empty jobs array when company has no industry", async () => {
    mockGetJobPostingWithCompany.mockResolvedValue({
      posting: activePosting,
      company: { ...techCompany, industry: null },
    } as never);

    const res = await GET(makeRequest("job-uuid-1"));
    expect(res.status).toBe(200);

    const json = (await res.json()) as { data: { jobs: unknown[] } };
    expect(json.data.jobs).toEqual([]);
    expect(mockGetSimilarJobs).not.toHaveBeenCalled();
  });

  it("returns similar jobs mapped to JobSearchResultItem shape", async () => {
    mockGetJobPostingWithCompany.mockResolvedValue({
      posting: activePosting,
      company: techCompany,
    } as never);
    mockGetSimilarJobs.mockResolvedValue([similarJob]);

    const res = await GET(makeRequest("job-uuid-1"));
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      data: { jobs: Array<{ id: string; companyName: string }> };
    };
    expect(json.data.jobs).toHaveLength(1);
    expect(json.data.jobs[0]).toMatchObject({
      id: "similar-1",
      title: "Frontend Developer",
      companyName: "OtherCorp",
      companyId: "company-2",
      relevance: null,
      snippet: null,
    });
  });

  it("is accessible without authentication (guest access)", async () => {
    mockGetJobPostingWithCompany.mockResolvedValue({
      posting: activePosting,
      company: techCompany,
    } as never);
    mockGetSimilarJobs.mockResolvedValue([]);

    // No auth headers — should not return 401
    const res = await GET(makeRequest("job-uuid-1"));
    expect(res.status).toBe(200);
  });

  it("also returns similar jobs for expired and filled postings", async () => {
    for (const status of ["expired", "filled"] as const) {
      mockGetJobPostingWithCompany.mockResolvedValue({
        posting: { ...activePosting, status },
        company: techCompany,
      } as never);
      mockGetSimilarJobs.mockResolvedValue([]);

      const res = await GET(makeRequest("job-uuid-1"));
      expect(res.status, `Expected 200 for status: ${status}`).toBe(200);
    }
  });

  it("uses ig locale when Accept-Language starts with 'ig'", async () => {
    mockGetJobPostingWithCompany.mockResolvedValue({
      posting: activePosting,
      company: techCompany,
    } as never);
    mockGetSimilarJobs.mockResolvedValue([]);

    await GET(makeRequest("job-uuid-1", { "Accept-Language": "ig-NG,ig;q=0.9" }));

    expect(mockGetSimilarJobs).toHaveBeenCalledWith(
      "job-uuid-1",
      "Technology",
      "React TypeScript",
      "Lagos, Nigeria",
      "ig",
    );
  });

  it("defaults to 'en' locale when Accept-Language is absent", async () => {
    mockGetJobPostingWithCompany.mockResolvedValue({
      posting: activePosting,
      company: techCompany,
    } as never);
    mockGetSimilarJobs.mockResolvedValue([]);

    await GET(makeRequest("job-uuid-1"));

    expect(mockGetSimilarJobs).toHaveBeenCalledWith(
      "job-uuid-1",
      "Technology",
      "React TypeScript",
      "Lagos, Nigeria",
      "en",
    );
  });
});
