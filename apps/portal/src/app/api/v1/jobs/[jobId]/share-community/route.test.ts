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
  shareJobToCommunity: vi.fn(),
}));

import { requireEmployerRole } from "@/lib/portal-permissions";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { shareJobToCommunity } from "@/services/job-analytics-service";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import { POST } from "./route";

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

function makePostRequest(jobId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/jobs/${jobId}/share-community`, {
    method: "POST",
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
  vi.mocked(shareJobToCommunity).mockResolvedValue({
    success: true,
    communityPostId: "comm-post-1",
  });
});

describe("POST /api/v1/jobs/[jobId]/share-community", () => {
  it("shares to community and returns success with communityPostId", async () => {
    const res = await POST(makePostRequest("jp-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { success: boolean; communityPostId: string } };
    expect(body.data.success).toBe(true);
    expect(body.data.communityPostId).toBe("comm-post-1");
    expect(shareJobToCommunity).toHaveBeenCalledWith("jp-1", "company-uuid", "user-123");
  });

  it("rejects non-employer (403 from requireEmployerRole)", async () => {
    vi.mocked(requireEmployerRole).mockRejectedValue(
      new ApiError({
        title: "Employer role required",
        status: 403,
        extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
      }),
    );
    const res = await POST(makePostRequest("jp-1"));
    expect(res.status).toBe(403);
  });

  it("returns 403 when employer has no company profile", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
    const res = await POST(makePostRequest("jp-1"));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe(PORTAL_ERRORS.COMPANY_REQUIRED);
  });

  it("returns 409 when posting is already shared", async () => {
    vi.mocked(shareJobToCommunity).mockResolvedValue({ success: false, reason: "already_shared" });
    const res = await POST(makePostRequest("jp-1"));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe(PORTAL_ERRORS.ALREADY_SHARED);
  });

  it("returns 409 when posting is not active (service throws)", async () => {
    vi.mocked(shareJobToCommunity).mockRejectedValue(
      new ApiError({
        title: "Only active postings can be shared",
        status: 409,
        extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
      }),
    );
    const res = await POST(makePostRequest("jp-1"));
    expect(res.status).toBe(409);
  });

  it("rejects requests without CSRF Origin header", async () => {
    const req = new Request("https://jobs.igbo.com/api/v1/jobs/jp-1/share-community", {
      method: "POST",
      headers: { Host: "jobs.igbo.com" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
