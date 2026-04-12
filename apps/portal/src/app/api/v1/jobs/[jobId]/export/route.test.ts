// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({
  requireEmployerRole: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyByOwnerId: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingWithCompany: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-applications", () => ({
  getApplicationsForExport: vi.fn(),
}));

import { requireEmployerRole } from "@/lib/portal-permissions";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { getJobPostingWithCompany } from "@igbo/db/queries/portal-job-postings";
import { getApplicationsForExport } from "@igbo/db/queries/portal-applications";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import { GET } from "./route";

const VALID_JOB_ID = "a1111111-1111-4111-a111-111111111111";
const COMPANY_ID = "b2222222-2222-4222-a222-222222222222";
const EMPLOYER_ID = "c3333333-3333-4333-a333-333333333333";

const employerSession = {
  user: { id: EMPLOYER_ID, activePortalRole: "EMPLOYER" },
};

const mockCompany = {
  id: COMPANY_ID,
  ownerUserId: EMPLOYER_ID,
  name: "Acme Corp",
  logoUrl: null,
  description: null,
  industry: "technology",
  companySize: "11-50",
  cultureInfo: null,
  trustBadge: false,
  onboardingCompletedAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const mockPosting = {
  id: VALID_JOB_ID,
  companyId: COMPANY_ID,
  title: "Senior Developer",
  descriptionHtml: "<p>Great role</p>",
  requirements: null,
  salaryMin: null,
  salaryMax: null,
  salaryCompetitiveOnly: false,
  location: "Lagos",
  employmentType: "full_time",
  status: "active",
  culturalContextJson: null,
  descriptionIgboHtml: null,
  applicationDeadline: null,
  expiresAt: null,
  adminFeedbackComment: null,
  closedOutcome: null,
  closedAt: null,
  archivedAt: null,
  viewCount: 10,
  communityPostId: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const mockApplications = [
  {
    seekerName: "Ada Okafor",
    seekerEmail: "ada@example.com",
    seekerHeadline: "Senior Engineer",
    status: "submitted" as const,
    createdAt: new Date("2026-04-01"),
    transitionedAt: new Date("2026-04-05"),
    consentEmployerView: true,
  },
  {
    seekerName: "Bob Eze",
    seekerEmail: "bob@example.com",
    seekerHeadline: "Designer",
    status: "under_review" as const,
    createdAt: new Date("2026-04-03"),
    transitionedAt: null,
    consentEmployerView: false,
  },
];

function makeRequest(jobId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/jobs/${jobId}/export`, {
    method: "GET",
    headers: {
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireEmployerRole).mockResolvedValue(employerSession as never);
  vi.mocked(getCompanyByOwnerId).mockResolvedValue(mockCompany);
  vi.mocked(getJobPostingWithCompany).mockResolvedValue({
    posting: mockPosting,
    company: mockCompany,
  } as never);
  vi.mocked(getApplicationsForExport).mockResolvedValue(mockApplications);
});

describe("GET /api/v1/jobs/[jobId]/export", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireEmployerRole).mockRejectedValue(
      new ApiError({ title: "Authentication required", status: 401 }),
    );
    const res = await GET(makeRequest(VALID_JOB_ID));
    expect(res.status).toBe(401);
    expect(getApplicationsForExport).not.toHaveBeenCalled();
  });

  it("returns 403 when role is not EMPLOYER", async () => {
    vi.mocked(requireEmployerRole).mockRejectedValue(
      new ApiError({
        title: "Employer role required",
        status: 403,
        extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
      }),
    );
    const res = await GET(makeRequest(VALID_JOB_ID));
    expect(res.status).toBe(403);
    expect(getApplicationsForExport).not.toHaveBeenCalled();
  });

  it("returns 400 when jobId is not a valid UUID", async () => {
    const res = await GET(makeRequest("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(getApplicationsForExport).not.toHaveBeenCalled();
  });

  it("returns 404 when employer has no company profile", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
    const res = await GET(makeRequest(VALID_JOB_ID));
    expect(res.status).toBe(404);
    expect(getApplicationsForExport).not.toHaveBeenCalled();
  });

  it("returns 404 when job posting not found", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue(null);
    const res = await GET(makeRequest(VALID_JOB_ID));
    expect(res.status).toBe(404);
    expect(getApplicationsForExport).not.toHaveBeenCalled();
  });

  it("returns 404 when job belongs to a different company", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue({
      posting: { ...mockPosting, companyId: "other-company-id" },
      company: { ...mockCompany, id: "other-company-id" },
    } as never);
    const res = await GET(makeRequest(VALID_JOB_ID));
    expect(res.status).toBe(404);
    expect(getApplicationsForExport).not.toHaveBeenCalled();
  });

  it("returns 200 with valid CSV for 2 applicants", async () => {
    const res = await GET(makeRequest(VALID_JOB_ID));
    expect(res.status).toBe(200);
    const body = await res.text();
    // Header row present
    expect(body).toContain("Name,Email,Headline,Status,Applied Date,Last Status Change");
    // Ada's row (consenting — email shown)
    expect(body).toContain("Ada Okafor");
    expect(body).toContain("ada@example.com");
    // Bob's row (non-consenting — email replaced)
    expect(body).toContain("Bob Eze");
    // 2 data rows + 1 header row (split by newline, BOM stripped by TextDecoder)
    const lines = body.split("\n");
    expect(lines.length).toBe(3); // header, row1, row2
  });

  it("omits email for non-consenting seeker (consent-gated email, AC-2)", async () => {
    const res = await GET(makeRequest(VALID_JOB_ID));
    const body = await res.text();
    const lines = body.split("\n");
    // Bob's line (index 2) should have em-dash instead of email
    const bobLine = lines[2] ?? "";
    expect(bobLine).toContain("\u2014"); // em-dash
    expect(bobLine).not.toContain("bob@example.com");
  });

  it("returns header-only CSV when no applicants (empty posting)", async () => {
    vi.mocked(getApplicationsForExport).mockResolvedValue([]);
    const res = await GET(makeRequest(VALID_JOB_ID));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Name,Email,Headline,Status,Applied Date,Last Status Change");
    // Only header line (BOM stripped by TextDecoder when reading as text)
    const lines = body.split("\n");
    expect(lines.length).toBe(1);
  });

  it("sets Content-Disposition header with sanitized filename", async () => {
    const res = await GET(makeRequest(VALID_JOB_ID));
    const disposition = res.headers.get("Content-Disposition") ?? "";
    expect(disposition).toMatch(/^attachment; filename="/);
    // Contains company and job title slugs
    expect(disposition).toContain("Acme-Corp");
    expect(disposition).toContain("Senior-Developer");
    expect(disposition).toContain("candidates");
    expect(disposition).toMatch(/\.csv"/);
  });

  it("starts response body with UTF-8 BOM bytes for Excel compatibility", async () => {
    const res = await GET(makeRequest(VALID_JOB_ID));
    // Check raw bytes: UTF-8 BOM is 0xEF 0xBB 0xBF
    // (TextDecoder strips BOM when reading as text, so we check arrayBuffer)
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
  });

  it("escapes CSV fields containing commas", async () => {
    vi.mocked(getApplicationsForExport).mockResolvedValue([
      {
        seekerName: "Smith, John",
        seekerEmail: "john@example.com",
        seekerHeadline: "Engineer",
        status: "submitted" as const,
        createdAt: new Date("2026-04-01"),
        transitionedAt: null,
        consentEmployerView: true,
      },
    ]);
    const res = await GET(makeRequest(VALID_JOB_ID));
    const body = await res.text();
    // Name with comma must be wrapped in double-quotes
    expect(body).toContain('"Smith, John"');
  });

  it("escapes CSV fields containing double-quotes", async () => {
    vi.mocked(getApplicationsForExport).mockResolvedValue([
      {
        seekerName: 'Jane "Dev" Doe',
        seekerEmail: "jane@example.com",
        seekerHeadline: "Engineer",
        status: "submitted" as const,
        createdAt: new Date("2026-04-01"),
        transitionedAt: null,
        consentEmployerView: true,
      },
    ]);
    const res = await GET(makeRequest(VALID_JOB_ID));
    const body = await res.text();
    // Double-quotes are escaped by doubling
    expect(body).toContain('"Jane ""Dev"" Doe"');
  });

  it("formats transitionedAt as YYYY-MM-DD when present, empty string when null", async () => {
    vi.mocked(getApplicationsForExport).mockResolvedValue([
      {
        seekerName: "Ada",
        seekerEmail: "ada@example.com",
        seekerHeadline: "Engineer",
        status: "submitted" as const,
        createdAt: new Date("2026-04-01"),
        transitionedAt: new Date("2026-04-05"),
        consentEmployerView: true,
      },
      {
        seekerName: "Bob",
        seekerEmail: "bob@example.com",
        seekerHeadline: "Designer",
        status: "submitted" as const,
        createdAt: new Date("2026-04-03"),
        transitionedAt: null,
        consentEmployerView: true,
      },
    ]);
    const res = await GET(makeRequest(VALID_JOB_ID));
    const body = await res.text();
    const lines = body.split("\n");
    const adaLine = lines[1] ?? "";
    const bobLine = lines[2] ?? "";
    // Ada has transitionedAt
    expect(adaLine).toContain("2026-04-05");
    // Bob has null transitionedAt → empty string (line ends with comma and empty field)
    expect(bobLine.endsWith(",")).toBe(true);
  });

  it("returns correct Content-Type header", async () => {
    const res = await GET(makeRequest(VALID_JOB_ID));
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
  });

  it("treats null consentEmployerView as false (replaces email with em-dash)", async () => {
    vi.mocked(getApplicationsForExport).mockResolvedValue([
      {
        seekerName: "Legacy User",
        seekerEmail: "legacy@example.com",
        seekerHeadline: "Engineer",
        status: "submitted" as const,
        createdAt: new Date("2026-04-01"),
        transitionedAt: null,
        consentEmployerView: null,
      },
    ]);
    const res = await GET(makeRequest(VALID_JOB_ID));
    const body = await res.text();
    expect(body).toContain("\u2014");
    expect(body).not.toContain("legacy@example.com");
  });

  it("neutralizes CSV formula injection in seeker-controlled fields", async () => {
    vi.mocked(getApplicationsForExport).mockResolvedValue([
      {
        seekerName: "=CMD(calc)",
        seekerEmail: "safe@example.com",
        seekerHeadline: "+1+cmd|'/C calc'!A0",
        status: "submitted" as const,
        createdAt: new Date("2026-04-01"),
        transitionedAt: null,
        consentEmployerView: true,
      },
    ]);
    const res = await GET(makeRequest(VALID_JOB_ID));
    const body = await res.text();
    // Formula-injection fields must be prefixed with single-quote inside quotes
    expect(body).toContain('"\'=CMD(calc)"');
    expect(body).toContain("\"'+1+cmd|'/C calc'!A0\"");
  });

  it("escapes fields containing carriage return", async () => {
    vi.mocked(getApplicationsForExport).mockResolvedValue([
      {
        seekerName: "Line1\rLine2",
        seekerEmail: "test@example.com",
        seekerHeadline: "Engineer",
        status: "submitted" as const,
        createdAt: new Date("2026-04-01"),
        transitionedAt: null,
        consentEmployerView: true,
      },
    ]);
    const res = await GET(makeRequest(VALID_JOB_ID));
    const body = await res.text();
    // Field with \r must be wrapped in double-quotes
    expect(body).toContain('"Line1\rLine2"');
  });
});
