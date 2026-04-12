// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-applications", () => ({
  getApplicationDetailForEmployer: vi.fn(),
  getTransitionHistory: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-application-notes", () => ({
  getNotesByApplicationId: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyByOwnerId: vi.fn(),
}));
vi.mock("@igbo/db/queries/cross-app", () => ({
  getSeekerTrustSignals: vi.fn(),
}));

import { auth } from "@igbo/auth";
import {
  getApplicationDetailForEmployer,
  getTransitionHistory,
} from "@igbo/db/queries/portal-applications";
import { getNotesByApplicationId } from "@igbo/db/queries/portal-application-notes";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { getSeekerTrustSignals } from "@igbo/db/queries/cross-app";
import { GET } from "./route";

const VALID_APP_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const EMPLOYER_ID = "employer-1";
const COMPANY_ID = "cp-1";
const SEEKER_ID = "seeker-1";

const employerSession = {
  user: { id: EMPLOYER_ID, activePortalRole: "EMPLOYER" },
};

const mockCompany = {
  id: COMPANY_ID,
  ownerUserId: EMPLOYER_ID,
} as unknown as Awaited<ReturnType<typeof getCompanyByOwnerId>>;

const mockDetail = {
  id: VALID_APP_ID,
  jobId: "jp-1",
  seekerUserId: SEEKER_ID,
  status: "submitted",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  coverLetterText: "Hello",
  portfolioLinksJson: ["https://example.com"],
  selectedCvId: "cv-1",
  jobTitle: "Senior Engineer",
  companyId: COMPANY_ID,
  seekerName: "Alice",
  seekerHeadline: "Engineer",
  seekerProfileId: "sp-1",
  seekerSummary: "Summary",
  seekerSkills: ["ts", "react"],
  cvId: "cv-1",
  cvLabel: "Resume 2024",
  cvProcessedUrl: "https://s3.example.com/cv.pdf",
} as unknown as Awaited<ReturnType<typeof getApplicationDetailForEmployer>>;

const mockTrustSignals = {
  isVerified: true,
  memberSince: new Date("2023-01-01"),
  memberDurationDays: 365,
  communityPoints: 500,
  engagementLevel: "high" as const,
  displayName: "Alice",
};

const mockTransitions = [
  {
    id: "t-1",
    applicationId: VALID_APP_ID,
    fromStatus: "submitted" as const,
    toStatus: "under_review" as const,
    actorUserId: EMPLOYER_ID,
    actorRole: "employer" as const,
    reason: null,
    createdAt: new Date("2024-01-02"),
  },
];

const mockNotes = [
  {
    id: "note-1",
    applicationId: VALID_APP_ID,
    authorUserId: EMPLOYER_ID,
    authorName: "Employer Jane",
    content: "Great candidate",
    createdAt: new Date("2024-01-03"),
  },
];

function makeRequest(applicationId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/applications/${applicationId}/detail`, {
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
  vi.mocked(getCompanyByOwnerId).mockResolvedValue(mockCompany);
  vi.mocked(getApplicationDetailForEmployer).mockResolvedValue(mockDetail);
  vi.mocked(getSeekerTrustSignals).mockResolvedValue(
    mockTrustSignals as unknown as Awaited<ReturnType<typeof getSeekerTrustSignals>>,
  );
  vi.mocked(getTransitionHistory).mockResolvedValue(mockTransitions);
  vi.mocked(getNotesByApplicationId).mockResolvedValue(mockNotes);
});

describe("GET /api/v1/applications/[applicationId]/detail", () => {
  it("returns 200 with full application detail", async () => {
    const res = await GET(makeRequest(VALID_APP_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.application.id).toBe(VALID_APP_ID);
    expect(body.data.application.seekerName).toBe("Alice");
    expect(body.data.application.cvProcessedUrl).toBe("https://s3.example.com/cv.pdf");
    expect(body.data.trustSignals.displayName).toBe("Alice");
    expect(body.data.transitions).toHaveLength(1);
  });

  it("calls all four queries in parallel with correct args", async () => {
    await GET(makeRequest(VALID_APP_ID));
    expect(getApplicationDetailForEmployer).toHaveBeenCalledWith(VALID_APP_ID, COMPANY_ID);
    expect(getSeekerTrustSignals).toHaveBeenCalledWith(SEEKER_ID);
    expect(getTransitionHistory).toHaveBeenCalledWith(VALID_APP_ID);
    expect(getNotesByApplicationId).toHaveBeenCalledWith(VALID_APP_ID);
  });

  it("returns notes in the response (P-2.10)", async () => {
    const res = await GET(makeRequest(VALID_APP_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.notes).toHaveLength(1);
    expect(body.data.notes[0].content).toBe("Great candidate");
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET(makeRequest(VALID_APP_ID));
    expect(res.status).toBe(401);
    expect(getApplicationDetailForEmployer).not.toHaveBeenCalled();
  });

  it("returns 403 when role is not EMPLOYER", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "seeker-1", activePortalRole: "JOB_SEEKER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    const res = await GET(makeRequest(VALID_APP_ID));
    expect(res.status).toBe(403);
    expect(getApplicationDetailForEmployer).not.toHaveBeenCalled();
  });

  it("returns 400 when applicationId is not a valid UUID", async () => {
    const res = await GET(makeRequest("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(getApplicationDetailForEmployer).not.toHaveBeenCalled();
  });

  it("returns 404 when employer has no company", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
    const res = await GET(makeRequest(VALID_APP_ID));
    expect(res.status).toBe(404);
    expect(getApplicationDetailForEmployer).not.toHaveBeenCalled();
  });

  it("returns 404 when application detail query returns null (not owned)", async () => {
    vi.mocked(getApplicationDetailForEmployer).mockResolvedValue(null);
    const res = await GET(makeRequest(VALID_APP_ID));
    expect(res.status).toBe(404);
    expect(getSeekerTrustSignals).not.toHaveBeenCalled();
    expect(getTransitionHistory).not.toHaveBeenCalled();
  });
});
