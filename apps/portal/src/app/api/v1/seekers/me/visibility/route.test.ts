// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-seeker-profiles", () => ({
  getSeekerProfileByUserId: vi.fn(),
  updateSeekerVisibility: vi.fn(),
}));

import { auth } from "@igbo/auth";
import {
  getSeekerProfileByUserId,
  updateSeekerVisibility,
} from "@igbo/db/queries/portal-seeker-profiles";
import { PATCH } from "./route";

const seekerSession = { user: { id: "user-1", activePortalRole: "JOB_SEEKER" } };
const employerSession = { user: { id: "user-2", activePortalRole: "EMPLOYER" } };

const mockProfile = {
  id: "profile-uuid",
  userId: "user-1",
  headline: "Engineer",
  summary: null,
  skills: [],
  experienceJson: [],
  educationJson: [],
  visibility: "passive",
  consentMatching: false,
  consentEmployerView: false,
  consentMatchingChangedAt: null,
  consentEmployerViewChangedAt: null,
  profileViewCount: 0,
  onboardingCompletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeRequest(body: unknown): Request {
  return new Request("https://jobs.igbo.com/api/v1/seekers/me/visibility", {
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
    seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
});

describe("PATCH /api/v1/seekers/me/visibility", () => {
  it("returns 200 and updated profile with new visibility", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(updateSeekerVisibility).mockResolvedValue({
      ...mockProfile,
      visibility: "active",
    } as Awaited<ReturnType<typeof updateSeekerVisibility>>);
    const res = await PATCH(makeRequest({ visibility: "active" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.visibility).toBe("active");
    expect(vi.mocked(updateSeekerVisibility)).toHaveBeenCalledWith("user-1", "active");
  });

  it("accepts passive and hidden values", async () => {
    for (const visibility of ["passive", "hidden"] as const) {
      vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
      vi.mocked(updateSeekerVisibility).mockResolvedValue({ ...mockProfile, visibility } as Awaited<
        ReturnType<typeof updateSeekerVisibility>
      >);
      const res = await PATCH(makeRequest({ visibility }));
      expect(res.status).toBe(200);
    }
  });

  it("returns 400 for invalid visibility value", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    const res = await PATCH(makeRequest({ visibility: "invisible" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-seeker role", async () => {
    vi.mocked(auth).mockResolvedValue(
      employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    const res = await PATCH(makeRequest({ visibility: "active" }));
    expect(res.status).toBe(403);
  });

  it("returns 404 SEEKER_PROFILE_REQUIRED when no profile", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(null);
    const res = await PATCH(makeRequest({ visibility: "active" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED");
  });

  it("returns 400 when body is missing visibility field", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    const res = await PATCH(makeRequest({}));
    expect(res.status).toBe(400);
  });
});
