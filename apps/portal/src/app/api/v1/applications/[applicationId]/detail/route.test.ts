// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/portal-permissions", () => ({
  requireEmployerRole: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-applications", () => ({
  getApplicationDetailForEmployer: vi.fn(),
  getTransitionHistory: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyByOwnerId: vi.fn(),
}));
vi.mock("@igbo/db/queries/cross-app", () => ({
  getSeekerTrustSignals: vi.fn(),
}));

import { requireEmployerRole } from "@/lib/portal-permissions";
import {
  getApplicationDetailForEmployer,
  getTransitionHistory,
} from "@igbo/db/queries/portal-applications";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { getSeekerTrustSignals } from "@igbo/db/queries/cross-app";
import { GET } from "./route";

type EmployerSession = { user: { id: string; activePortalRole: string } };
const employerSession: EmployerSession = {
  user: { id: "employer-1", activePortalRole: "EMPLOYER" },
};

const mockCompany = { id: "company-1", ownerUserId: "employer-1", name: "Acme Corp" };
const mockApplication = {
  id: "app-1",
  jobId: "jp-1",
  seekerUserId: "u-1",
  status: "shortlisted",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-10"),
  coverLetterText: "I am a great fit.",
  portfolioLinksJson: ["https://portfolio.com"],
  selectedCvId: "cv-1",
  seekerName: "Ada Okafor",
  seekerHeadline: "Senior Engineer",
  seekerProfileId: "sp-1",
  seekerSkills: ["TypeScript"],
  seekerSummary: "Experienced engineer.",
  cvId: "cv-1",
  cvLabel: "Main CV",
  cvProcessedUrl: "https://s3.example.com/cv.pdf",
};

const mockTrustSignals = {
  isVerified: true,
  badgeType: "community_member",
  memberSince: new Date("2023-01-01"),
  memberDurationDays: 365,
  communityPoints: 250,
  engagementLevel: "medium" as const,
  displayName: "Ada",
};

const mockTransitions = [
  {
    id: "tr-1",
    applicationId: "app-1",
    fromStatus: "submitted",
    toStatus: "shortlisted",
    actorUserId: "employer-1",
    actorRole: "employer",
    reason: null,
    createdAt: new Date("2026-01-05"),
  },
];

const APP_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

function makeGetRequest(applicationId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/applications/${applicationId}/detail`, {
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
  vi.mocked(getApplicationDetailForEmployer).mockResolvedValue(mockApplication as never);
  vi.mocked(getSeekerTrustSignals).mockResolvedValue(mockTrustSignals as never);
  vi.mocked(getTransitionHistory).mockResolvedValue(mockTransitions as never);
});

describe("GET /api/v1/applications/[applicationId]/detail", () => {
  it("returns 200 with full application data, trust signals, and transitions", async () => {
    const res = await GET(makeGetRequest(APP_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.application.id).toBe("app-1");
    expect(body.data.application.seekerName).toBe("Ada Okafor");
    expect(body.data.application.cvLabel).toBe("Main CV");
    expect(body.data.trustSignals.isVerified).toBe(true);
    expect(body.data.transitions).toHaveLength(1);
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(requireEmployerRole).mockRejectedValue(
      new ApiError({ title: "Authentication required", status: 401 }),
    );
    const res = await GET(makeGetRequest(APP_ID));
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not EMPLOYER", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(requireEmployerRole).mockRejectedValue(
      new ApiError({ title: "Employer role required", status: 403 }),
    );
    const res = await GET(makeGetRequest(APP_ID));
    expect(res.status).toBe(403);
  });

  it("returns 404 when employer has no company profile", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
    const res = await GET(makeGetRequest(APP_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when application not found or not owned", async () => {
    vi.mocked(getApplicationDetailForEmployer).mockResolvedValue(null);
    const res = await GET(makeGetRequest(APP_ID));
    expect(res.status).toBe(404);
  });

  it("calls getApplicationDetailForEmployer with correct companyId", async () => {
    await GET(makeGetRequest(APP_ID));
    expect(getApplicationDetailForEmployer).toHaveBeenCalledWith(APP_ID, "company-1");
  });

  it("calls getSeekerTrustSignals with seekerUserId", async () => {
    await GET(makeGetRequest(APP_ID));
    expect(getSeekerTrustSignals).toHaveBeenCalledWith("u-1");
  });

  it("calls getTransitionHistory with applicationId", async () => {
    await GET(makeGetRequest(APP_ID));
    expect(getTransitionHistory).toHaveBeenCalledWith(APP_ID);
  });
});
