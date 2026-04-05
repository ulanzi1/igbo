// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyByOwnerId: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingWithCompany: vi.fn(),
  updateJobPosting: vi.fn(),
}));
vi.mock("@/lib/sanitize", () => ({
  sanitizeHtml: vi.fn((html: string) => html),
}));
vi.mock("@/services/job-posting-service", () => ({
  canEditPosting: vi.fn(),
  editActivePosting: vi.fn(),
  renewPosting: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { getJobPostingWithCompany, updateJobPosting } from "@igbo/db/queries/portal-job-postings";
import { canEditPosting, editActivePosting, renewPosting } from "@/services/job-posting-service";
import { GET, PATCH } from "./route";

const employerSession = {
  user: { id: "user-123", activePortalRole: "EMPLOYER" },
};

const mockCompany = {
  id: "company-uuid",
  ownerUserId: "user-123",
  name: "Acme Corp",
  logoUrl: null,
  description: null,
  industry: "technology",
  companySize: "11-50",
  cultureInfo: null,
  trustBadge: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPosting = {
  id: "posting-uuid",
  companyId: "company-uuid",
  title: "Senior Engineer",
  descriptionHtml: "<p>Role description</p>",
  requirements: "<p>5+ years exp</p>",
  salaryMin: null,
  salaryMax: null,
  salaryCompetitiveOnly: false,
  location: "Lagos",
  employmentType: "full_time",
  status: "draft",
  culturalContextJson: null,
  descriptionIgboHtml: null,
  applicationDeadline: null,
  expiresAt: null,
  adminFeedbackComment: null,
  closedOutcome: null,
  closedAt: null,
  createdAt: new Date(),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const mockResult = { posting: mockPosting, company: mockCompany };

function makeGetRequest(jobId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/jobs/${jobId}`, {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

function makePatchRequest(jobId: string, body: unknown): Request {
  return new Request(`https://jobs.igbo.com/api/v1/jobs/${jobId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
    },
    body: JSON.stringify(body),
  });
}

const validPatchBody = {
  title: "Updated Engineer",
  employmentType: "full_time",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
  vi.mocked(getCompanyByOwnerId).mockResolvedValue(mockCompany);
  vi.mocked(getJobPostingWithCompany).mockResolvedValue(mockResult as never);
  vi.mocked(canEditPosting).mockReturnValue(true);
  vi.mocked(editActivePosting).mockResolvedValue(undefined);
  vi.mocked(updateJobPosting).mockResolvedValue(mockPosting as never);
  vi.mocked(renewPosting).mockResolvedValue(undefined);
});

describe("GET /api/v1/jobs/[jobId]", () => {
  it("returns posting with company for employer owner (200)", async () => {
    const res = await GET(makeGetRequest("posting-uuid"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.posting.id).toBe("posting-uuid");
    expect(body.data.company.name).toBe("Acme Corp");
  });

  it("returns 403 when employer has no company profile", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
    const res = await GET(makeGetRequest("posting-uuid"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when posting not found", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue(null);
    const res = await GET(makeGetRequest("unknown"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when posting belongs to different company", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue({
      ...mockResult,
      posting: { ...mockPosting, companyId: "other-company" },
    } as never);
    const res = await GET(makeGetRequest("posting-uuid"));
    expect(res.status).toBe(403);
  });

  it("returns 403 for non-employer role", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-456", activePortalRole: "JOB_SEEKER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    const res = await GET(makeGetRequest("posting-uuid"));
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/v1/jobs/[jobId]", () => {
  it("updates a draft posting and returns 200", async () => {
    const res = await PATCH(makePatchRequest("posting-uuid", validPatchBody));
    expect(res.status).toBe(200);
    expect(updateJobPosting).toHaveBeenCalledWith(
      "posting-uuid",
      expect.objectContaining({ title: "Updated Engineer" }),
    );
  });

  it("calls editActivePosting for active posting (re-review transition)", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue({
      ...mockResult,
      posting: { ...mockPosting, status: "active" },
    } as never);
    const res = await PATCH(makePatchRequest("posting-uuid", validPatchBody));
    expect(res.status).toBe(200);
    expect(editActivePosting).toHaveBeenCalled();
  });

  it("returns 403 when posting is pending_review (edit blocked)", async () => {
    vi.mocked(canEditPosting).mockReturnValue(false);
    const res = await PATCH(makePatchRequest("posting-uuid", validPatchBody));
    expect(res.status).toBe(403);
  });

  it("returns 403 when employer has no company profile", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
    const res = await PATCH(makePatchRequest("posting-uuid", validPatchBody));
    expect(res.status).toBe(403);
  });

  it("returns 404 when posting not found", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue(null);
    const res = await PATCH(makePatchRequest("posting-uuid", validPatchBody));
    expect(res.status).toBe(404);
  });

  it("returns 403 when posting belongs to different company", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue({
      ...mockResult,
      posting: { ...mockPosting, companyId: "other-company" },
    } as never);
    const res = await PATCH(makePatchRequest("posting-uuid", validPatchBody));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body (missing title)", async () => {
    const res = await PATCH(makePatchRequest("posting-uuid", { employmentType: "full_time" }));
    expect(res.status).toBe(400);
  });

  it("employer cannot set adminFeedbackComment via PATCH body (not in schema)", async () => {
    const _res = await PATCH(
      makePatchRequest("posting-uuid", {
        ...validPatchBody,
        adminFeedbackComment: "Hacked!",
      }),
    );
    // Still succeeds but adminFeedbackComment is stripped by schema
    expect(updateJobPosting).toHaveBeenCalledWith(
      "posting-uuid",
      expect.not.objectContaining({ adminFeedbackComment: "Hacked!" }),
    );
  });

  it("sanitizes HTML fields before update", async () => {
    const { sanitizeHtml } = await import("@/lib/sanitize");
    await PATCH(
      makePatchRequest("posting-uuid", {
        ...validPatchBody,
        descriptionHtml: "<p>desc</p>",
        requirements: "<p>req</p>",
      }),
    );
    expect(sanitizeHtml).toHaveBeenCalledWith("<p>desc</p>");
    expect(sanitizeHtml).toHaveBeenCalledWith("<p>req</p>");
  });

  it("saves expiresAt when patching a draft posting", async () => {
    const expiresAt = "2026-12-31T00:00:00.000Z";
    const res = await PATCH(makePatchRequest("posting-uuid", { ...validPatchBody, expiresAt }));
    expect(res.status).toBe(200);
    expect(updateJobPosting).toHaveBeenCalledWith(
      "posting-uuid",
      expect.objectContaining({ expiresAt: new Date(expiresAt) }),
    );
    expect(renewPosting).not.toHaveBeenCalled();
  });

  it("calls updateJobPosting then renewPosting for expired posting with expiresAt (Edit & Renew)", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue({
      ...mockResult,
      posting: { ...mockPosting, status: "expired" },
    } as never);
    const expiresAt = "2026-12-31T00:00:00.000Z";
    const res = await PATCH(makePatchRequest("posting-uuid", { ...validPatchBody, expiresAt }));
    expect(res.status).toBe(200);
    expect(updateJobPosting).toHaveBeenCalledWith(
      "posting-uuid",
      expect.objectContaining({ expiresAt: new Date(expiresAt) }),
    );
    expect(renewPosting).toHaveBeenCalledWith(
      "posting-uuid",
      "company-uuid",
      expiresAt,
      true,
      "EMPLOYER",
    );
  });

  it("returns 400 for expired posting PATCH without expiresAt", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue({
      ...mockResult,
      posting: { ...mockPosting, status: "expired" },
    } as never);
    const res = await PATCH(makePatchRequest("posting-uuid", validPatchBody));
    expect(res.status).toBe(400);
    expect(updateJobPosting).not.toHaveBeenCalled();
    expect(renewPosting).not.toHaveBeenCalled();
  });
});
