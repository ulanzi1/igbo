// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-seeker-profiles", () => ({
  getSeekerProfileByUserId: vi.fn(),
  markSeekerOnboardingComplete: vi.fn(),
}));

import { auth } from "@igbo/auth";
import {
  getSeekerProfileByUserId,
  markSeekerOnboardingComplete,
} from "@igbo/db/queries/portal-seeker-profiles";
import { POST } from "./route";

const seekerSession = {
  user: { id: "user-123", activePortalRole: "JOB_SEEKER" },
};

const mockProfile = {
  id: "seeker-uuid",
  userId: "user-123",
  headline: "Senior Engineer",
  summary: null,
  skills: [],
  experienceJson: [],
  educationJson: [],
  visibility: "passive",
  consentMatching: false,
  consentEmployerView: false,
  consentMatchingChangedAt: null,
  consentEmployerViewChangedAt: null,
  onboardingCompletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
});

function makePostRequest(): Request {
  return new Request("https://jobs.igbo.com/api/v1/seekers/me/onboarding/complete", {
    method: "POST",
    headers: {
      Host: "jobs.igbo.com",
      Origin: "https://jobs.igbo.com",
      "Content-Type": "application/json",
    },
  });
}

describe("POST /api/v1/seekers/me/onboarding/complete", () => {
  it("marks onboarding complete and returns 200 with completed:true", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(markSeekerOnboardingComplete).mockResolvedValue({
      ...mockProfile,
      onboardingCompletedAt: new Date(),
    });
    const res = await POST(makePostRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.completed).toBe(true);
  });

  it("returns 200 idempotent when already marked (markSeekerOnboardingComplete returns null)", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue({
      ...mockProfile,
      onboardingCompletedAt: new Date(),
    });
    vi.mocked(markSeekerOnboardingComplete).mockResolvedValue(null);
    const res = await POST(makePostRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.completed).toBe(true);
  });

  it("returns 404 SEEKER_PROFILE_REQUIRED when no profile exists", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(null);
    const res = await POST(makePostRequest());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED");
  });

  it("returns 403 for non-seeker role (EMPLOYER)", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-456", activePortalRole: "EMPLOYER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    const res = await POST(makePostRequest());
    expect(res.status).toBe(403);
  });

  it("returns 401 for unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(
      null as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    const res = await POST(makePostRequest());
    expect(res.status).toBe(401);
  });

  it("handles markSeekerOnboardingComplete returning null gracefully (still 200)", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(markSeekerOnboardingComplete).mockResolvedValue(null);
    const res = await POST(makePostRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.completed).toBe(true);
  });
});
