// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({
  requireEmployerRole: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyByOwnerId: vi.fn(),
}));
vi.mock("@/services/job-analytics-service", () => ({
  getAnalytics: vi.fn(),
}));

import { requireEmployerRole } from "@/lib/portal-permissions";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { getAnalytics } from "@/services/job-analytics-service";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import { GET } from "./route";

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
  onboardingCompletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockAnalytics = {
  views: 42,
  applications: 5,
  conversionRate: 11.9,
  sharedToCommunity: false,
};

function makeGetRequest(jobId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/jobs/${jobId}/analytics`, {
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
  vi.mocked(getAnalytics).mockResolvedValue(mockAnalytics);
});

describe("GET /api/v1/jobs/[jobId]/analytics", () => {
  it("returns analytics for an employer with a company", async () => {
    const res = await GET(makeGetRequest("jp-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: typeof mockAnalytics };
    expect(body.data.views).toBe(42);
    expect(body.data.applications).toBe(5);
    expect(body.data.conversionRate).toBe(11.9);
    expect(body.data.sharedToCommunity).toBe(false);
  });

  it("rejects non-employer (403 from requireEmployerRole)", async () => {
    vi.mocked(requireEmployerRole).mockRejectedValue(
      new ApiError({
        title: "Employer role required",
        status: 403,
        extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
      }),
    );
    const res = await GET(makeGetRequest("jp-1"));
    expect(res.status).toBe(403);
  });

  it("returns 403 when employer has no company profile", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
    const res = await GET(makeGetRequest("jp-1"));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe(PORTAL_ERRORS.COMPANY_REQUIRED);
  });

  it("returns 404 when posting not found (service throws)", async () => {
    vi.mocked(getAnalytics).mockRejectedValue(
      new ApiError({
        title: "Not found",
        status: 404,
        extensions: { code: PORTAL_ERRORS.NOT_FOUND },
      }),
    );
    const res = await GET(makeGetRequest("non-existent"));
    expect(res.status).toBe(404);
  });

  it("returns 0 conversion rate when views is 0", async () => {
    vi.mocked(getAnalytics).mockResolvedValue({
      views: 0,
      applications: 0,
      conversionRate: 0,
      sharedToCommunity: false,
    });
    const res = await GET(makeGetRequest("jp-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { conversionRate: number } };
    expect(body.data.conversionRate).toBe(0);
  });
});
