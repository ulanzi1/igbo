// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyByOwnerId: vi.fn(),
  markOnboardingComplete: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { getCompanyByOwnerId, markOnboardingComplete } from "@igbo/db/queries/portal-companies";
import { POST } from "./route";

const employerSession = {
  user: { id: "user-123", activePortalRole: "EMPLOYER" },
};

const mockProfile = {
  id: "company-uuid",
  ownerUserId: "user-123",
  name: "Acme Corp",
  logoUrl: null,
  description: null,
  industry: null,
  companySize: null,
  cultureInfo: null,
  trustBadge: false,
  onboardingCompletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makePostRequest(): Request {
  return new Request("https://jobs.igbo.com/api/v1/onboarding/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
});

describe("POST /api/v1/onboarding/complete", () => {
  it("marks onboarding complete and returns success", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(mockProfile);
    vi.mocked(markOnboardingComplete).mockResolvedValue({
      ...mockProfile,
      onboardingCompletedAt: new Date(),
    });

    const res = await POST(makePostRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(true);
    expect(markOnboardingComplete).toHaveBeenCalledWith("company-uuid");
  });

  it("returns 404 when employer has no company profile", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);

    const res = await POST(makePostRequest());
    expect(res.status).toBe(404);
  });

  it("returns 403 for non-employer role", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-456", activePortalRole: "JOB_SEEKER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

    const res = await POST(makePostRequest());
    expect(res.status).toBe(403);
  });

  it("returns 401 for unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const res = await POST(makePostRequest());
    expect(res.status).toBe(401);
  });

  it("is idempotent — repeating the call still returns 200", async () => {
    const completedProfile = { ...mockProfile, onboardingCompletedAt: new Date() };
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(completedProfile);
    vi.mocked(markOnboardingComplete).mockResolvedValue(null); // no-op

    const res = await POST(makePostRequest());
    expect(res.status).toBe(200);
    expect(markOnboardingComplete).toHaveBeenCalledWith("company-uuid");
  });

  it("requires CSRF Origin header for POST", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(mockProfile);

    const req = new Request("https://jobs.igbo.com/api/v1/onboarding/complete", {
      method: "POST",
      headers: { Host: "jobs.igbo.com" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
