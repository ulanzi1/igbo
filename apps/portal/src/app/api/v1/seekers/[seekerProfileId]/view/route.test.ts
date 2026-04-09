// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-seeker-profiles", () => ({
  getSeekerProfileById: vi.fn(),
}));
vi.mock("@/services/seeker-analytics-service", () => ({
  recordSeekerProfileView: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { getSeekerProfileById } from "@igbo/db/queries/portal-seeker-profiles";
import { recordSeekerProfileView } from "@/services/seeker-analytics-service";
import { POST } from "./route";

const SEEKER_PROFILE_ID = "11111111-1111-1111-1111-111111111111";
const SEEKER_USER_ID = "22222222-2222-2222-2222-222222222222";
const EMPLOYER_USER_ID = "33333333-3333-3333-3333-333333333333";

const employerSession = {
  user: { id: EMPLOYER_USER_ID, activePortalRole: "EMPLOYER" },
};

const mockProfile = {
  id: SEEKER_PROFILE_ID,
  userId: SEEKER_USER_ID,
  headline: "Dev",
  summary: null,
  skills: [],
  experienceJson: [],
  educationJson: [],
  visibility: "active",
  consentMatching: false,
  consentEmployerView: false,
  consentMatchingChangedAt: null,
  consentEmployerViewChangedAt: null,
  profileViewCount: 3,
  onboardingCompletedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makePostRequest(seekerProfileId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/seekers/${seekerProfileId}/view`, {
    method: "POST",
    headers: {
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(employerSession as never);
  vi.mocked(getSeekerProfileById).mockResolvedValue(mockProfile);
  vi.mocked(recordSeekerProfileView).mockResolvedValue(true);
});

describe("POST /api/v1/seekers/[seekerProfileId]/view", () => {
  it("returns 200 with recorded:true for unique view", async () => {
    const res = await POST(makePostRequest(SEEKER_PROFILE_ID));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { recorded: boolean } };
    expect(body.data.recorded).toBe(true);
    expect(recordSeekerProfileView).toHaveBeenCalledWith(SEEKER_PROFILE_ID, EMPLOYER_USER_ID);
  });

  it("returns 200 with recorded:false for duplicate view", async () => {
    vi.mocked(recordSeekerProfileView).mockResolvedValue(false);
    const res = await POST(makePostRequest(SEEKER_PROFILE_ID));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { recorded: boolean } };
    expect(body.data.recorded).toBe(false);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(makePostRequest(SEEKER_PROFILE_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid UUID format", async () => {
    const res = await POST(makePostRequest("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when seeker profile not found", async () => {
    vi.mocked(getSeekerProfileById).mockResolvedValue(null);
    const res = await POST(makePostRequest("00000000-0000-0000-0000-000000000000"));
    expect(res.status).toBe(404);
  });

  it("returns recorded:false for self-view (viewer is profile owner)", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: SEEKER_USER_ID, activePortalRole: "JOB_SEEKER" },
    } as never);
    const res = await POST(makePostRequest(SEEKER_PROFILE_ID));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { recorded: boolean } };
    expect(body.data.recorded).toBe(false);
    expect(recordSeekerProfileView).not.toHaveBeenCalled();
  });

  it("still records when Redis fails (graceful degradation via service layer)", async () => {
    vi.mocked(recordSeekerProfileView).mockResolvedValue(true);
    const res = await POST(makePostRequest(SEEKER_PROFILE_ID));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { recorded: boolean } };
    expect(body.data.recorded).toBe(true);
  });

  it("extracts seekerProfileId at position -2 from URL segments", async () => {
    vi.mocked(getSeekerProfileById).mockResolvedValue(null);
    const res = await POST(makePostRequest("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"));
    expect(res.status).toBe(404);
    expect(getSeekerProfileById).toHaveBeenCalledWith("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });
});
