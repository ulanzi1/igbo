// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyById: vi.fn(),
  updateCompanyProfile: vi.fn(),
}));
vi.mock("@igbo/db/queries/cross-app", () => ({
  getCommunityTrustSignals: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { getCompanyById, updateCompanyProfile } from "@igbo/db/queries/portal-companies";
import { getCommunityTrustSignals } from "@igbo/db/queries/cross-app";
import { GET, PATCH } from "./route";

const employerSession = {
  user: { id: "user-123", activePortalRole: "EMPLOYER" },
};

const mockProfile = {
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

const mockTrustSignals = {
  isVerified: true,
  memberSince: new Date("2023-01-01"),
  displayName: "Ngozi Okonkwo",
  engagementLevel: "high" as const,
};

function makeGetRequest(companyId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/companies/${companyId}`, {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

function makePatchRequest(companyId: string, body: unknown): Request {
  return new Request(`https://jobs.igbo.com/api/v1/companies/${companyId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
  vi.mocked(getCommunityTrustSignals).mockResolvedValue(mockTrustSignals);
});

describe("GET /api/v1/companies/[companyId]", () => {
  it("returns public profile with trust signals", async () => {
    vi.mocked(getCompanyById).mockResolvedValue(mockProfile);

    const req = makeGetRequest("company-uuid");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("Acme Corp");
    expect(body.data.trustSignals.isVerified).toBe(true);
    expect(body.data.trustSignals.engagementLevel).toBe("high");
  });

  it("returns 404 for non-existent company", async () => {
    vi.mocked(getCompanyById).mockResolvedValue(null);

    const req = makeGetRequest("nonexistent");
    const res = await GET(req);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/companies/[companyId]", () => {
  it("updates profile fields for owner", async () => {
    const updatedProfile = { ...mockProfile, name: "Updated Corp" };
    vi.mocked(getCompanyById).mockResolvedValue(mockProfile);
    vi.mocked(updateCompanyProfile).mockResolvedValue(updatedProfile);

    const req = makePatchRequest("company-uuid", { name: "Updated Corp" });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("Updated Corp");
  });

  it("returns 403 for non-owner employer", async () => {
    const otherEmployerProfile = { ...mockProfile, ownerUserId: "other-user" };
    vi.mocked(getCompanyById).mockResolvedValue(otherEmployerProfile);

    const req = makePatchRequest("company-uuid", { name: "Hijacked Corp" });
    const res = await PATCH(req);
    expect(res.status).toBe(403);
  });

  it("returns 403 for non-employer role", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "seeker-123", activePortalRole: "JOB_SEEKER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

    const req = makePatchRequest("company-uuid", { name: "Corp" });
    const res = await PATCH(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body (name > 200 chars)", async () => {
    vi.mocked(getCompanyById).mockResolvedValue(mockProfile);

    const req = makePatchRequest("company-uuid", { name: "A".repeat(201) });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("updates only provided fields (partial update)", async () => {
    vi.mocked(getCompanyById).mockResolvedValue(mockProfile);
    vi.mocked(updateCompanyProfile).mockResolvedValue({ ...mockProfile, industry: "healthcare" });

    const req = makePatchRequest("company-uuid", { industry: "healthcare" });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    expect(updateCompanyProfile).toHaveBeenCalledWith(
      "company-uuid",
      expect.objectContaining({ industry: "healthcare" }),
    );
  });

  it("returns 404 for non-existent company", async () => {
    vi.mocked(getCompanyById).mockResolvedValue(null);

    const req = makePatchRequest("missing-uuid", { name: "Corp" });
    const res = await PATCH(req);
    expect(res.status).toBe(404);
  });

  it("refreshes updatedAt timestamp (updateCompanyProfile called)", async () => {
    vi.mocked(getCompanyById).mockResolvedValue(mockProfile);
    vi.mocked(updateCompanyProfile).mockResolvedValue({
      ...mockProfile,
      updatedAt: new Date(),
    });

    const req = makePatchRequest("company-uuid", { description: "New desc" });
    await PATCH(req);
    expect(updateCompanyProfile).toHaveBeenCalledWith(
      "company-uuid",
      expect.objectContaining({ description: "New desc" }),
    );
  });
});
