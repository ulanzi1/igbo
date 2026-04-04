// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyByOwnerId: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  createJobPosting: vi.fn(),
  getJobPostingsByCompanyId: vi.fn(),
}));
vi.mock("@/lib/sanitize", () => ({
  sanitizeHtml: vi.fn((html: string) => html),
}));

import { auth } from "@igbo/auth";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { createJobPosting, getJobPostingsByCompanyId } from "@igbo/db/queries/portal-job-postings";
import { sanitizeHtml } from "@/lib/sanitize";
import { POST, GET } from "./route";

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
  salaryMin: 500000,
  salaryMax: 750000,
  salaryCompetitiveOnly: false,
  location: "Lagos",
  employmentType: "full_time",
  status: "draft",
  culturalContextJson: null,
  descriptionIgboHtml: null,
  applicationDeadline: null,
  expiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const validBody = {
  title: "Senior Engineer",
  employmentType: "full_time",
  descriptionHtml: "<p>Role description</p>",
  requirements: "<p>5+ years exp</p>",
  salaryMin: 500000,
  salaryMax: 750000,
  location: "Lagos",
};

function makePostRequest(body: unknown): Request {
  return new Request("https://jobs.igbo.com/api/v1/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
    },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(): Request {
  return new Request("https://jobs.igbo.com/api/v1/jobs", {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
  vi.mocked(getCompanyByOwnerId).mockResolvedValue(mockCompany);
  vi.mocked(createJobPosting).mockResolvedValue(
    mockPosting as ReturnType<typeof createJobPosting> extends Promise<infer T> ? T : never,
  );
  vi.mocked(getJobPostingsByCompanyId).mockResolvedValue([mockPosting] as ReturnType<
    typeof getJobPostingsByCompanyId
  > extends Promise<infer T>
    ? T
    : never);
});

describe("POST /api/v1/jobs", () => {
  it("creates a draft posting for employer with company profile (201)", async () => {
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("posting-uuid");
    expect(body.data.status).toBe("draft");
  });

  it("returns 403 when employer has no company profile", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.COMPANY_REQUIRED");
  });

  it("returns 403 for non-employer role", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-456", activePortalRole: "JOB_SEEKER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.ROLE_MISMATCH");
  });

  it("returns 401 for unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing title", async () => {
    const res = await POST(makePostRequest({ employmentType: "full_time" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when salary min > salary max", async () => {
    const res = await POST(makePostRequest({ ...validBody, salaryMin: 900000, salaryMax: 500000 }));
    expect(res.status).toBe(400);
  });

  it("sanitizes HTML before storage", async () => {
    await POST(makePostRequest(validBody));
    expect(sanitizeHtml).toHaveBeenCalledWith("<p>Role description</p>");
    expect(sanitizeHtml).toHaveBeenCalledWith("<p>5+ years exp</p>");
  });

  it("calls createJobPosting with companyId and draft status", async () => {
    await POST(makePostRequest(validBody));
    expect(createJobPosting).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-uuid",
        status: "draft",
        title: "Senior Engineer",
      }),
    );
  });

  it("converts applicationDeadline string to Date object", async () => {
    const deadline = "2026-06-01T00:00:00.000Z";
    await POST(makePostRequest({ ...validBody, applicationDeadline: deadline }));
    expect(createJobPosting).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationDeadline: new Date(deadline),
      }),
    );
  });

  // Cultural context and Igbo description tests
  it("POST with cultural context (some flags true) -- stores culturalContextJson", async () => {
    const culturalContext = {
      diasporaFriendly: true,
      igboLanguagePreferred: true,
      communityReferred: false,
    };
    await POST(makePostRequest({ ...validBody, culturalContextJson: culturalContext }));
    expect(createJobPosting).toHaveBeenCalledWith(
      expect.objectContaining({
        culturalContextJson: culturalContext,
      }),
    );
  });

  it("POST with all cultural context flags false -- stores null (normalizes to null)", async () => {
    const culturalContext = {
      diasporaFriendly: false,
      igboLanguagePreferred: false,
      communityReferred: false,
    };
    await POST(makePostRequest({ ...validBody, culturalContextJson: culturalContext }));
    expect(createJobPosting).toHaveBeenCalledWith(
      expect.objectContaining({
        culturalContextJson: null,
      }),
    );
  });

  it("POST with Igbo HTML -- sanitizes and saves descriptionIgboHtml", async () => {
    const igboHtml = "<p>Nkọwa ọrụ</p>";
    await POST(makePostRequest({ ...validBody, descriptionIgboHtml: igboHtml }));
    expect(sanitizeHtml).toHaveBeenCalledWith(igboHtml);
    expect(createJobPosting).toHaveBeenCalledWith(
      expect.objectContaining({
        descriptionIgboHtml: igboHtml,
      }),
    );
  });

  it("POST with Igbo HTML containing script -- sanitizeHtml called for Igbo content (strips tags)", async () => {
    const maliciousHtml = '<p>Nkọwa</p><script>alert("xss")</script>';
    const strippedHtml = "<p>Nkọwa</p>";
    // Override mock to simulate actual sanitization for Igbo content
    vi.mocked(sanitizeHtml)
      .mockImplementationOnce((html) => html) // desc
      .mockImplementationOnce((html) => html) // req
      .mockImplementationOnce(() => strippedHtml); // igbo stripped

    await POST(makePostRequest({ ...validBody, descriptionIgboHtml: maliciousHtml }));
    expect(createJobPosting).toHaveBeenCalledWith(
      expect.objectContaining({
        descriptionIgboHtml: strippedHtml,
      }),
    );
  });

  it("POST with both English and Igbo descriptions -- both present in createJobPosting", async () => {
    const igboHtml = "<p>Nkọwa ọrụ</p>";
    await POST(makePostRequest({ ...validBody, descriptionIgboHtml: igboHtml }));
    expect(createJobPosting).toHaveBeenCalledWith(
      expect.objectContaining({
        descriptionHtml: "<p>Role description</p>",
        descriptionIgboHtml: igboHtml,
      }),
    );
  });

  it("POST without cultural context or Igbo -- backward compatible (both null)", async () => {
    await POST(makePostRequest(validBody));
    expect(createJobPosting).toHaveBeenCalledWith(
      expect.objectContaining({
        culturalContextJson: null,
        descriptionIgboHtml: null,
      }),
    );
  });

  it("POST with Igbo HTML -- sanitizeHtml called 3 times (desc + req + igbo)", async () => {
    await POST(makePostRequest({ ...validBody, descriptionIgboHtml: "<p>Igbo</p>" }));
    expect(vi.mocked(sanitizeHtml)).toHaveBeenCalledTimes(3);
  });

  it("POST without Igbo HTML -- sanitizeHtml called 2 times only (desc + req)", async () => {
    await POST(makePostRequest(validBody));
    expect(vi.mocked(sanitizeHtml)).toHaveBeenCalledTimes(2);
  });
});

describe("GET /api/v1/jobs", () => {
  it("returns list of employer's postings", async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("posting-uuid");
  });

  it("returns empty array when employer has no company profile", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it("returns 403 for non-employer role", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-456", activePortalRole: "JOB_SEEKER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });
});
