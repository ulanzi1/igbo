// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-seeker-profiles", () => ({
  getSeekerProfileByUserId: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-seeker-preferences", () => ({
  getSeekerPreferencesByProfileId: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-job-search", () => ({
  getJobPostingsForMatching: vi.fn(),
}));
vi.mock("@/services/match-scoring-service", () => ({
  computeMatchScore: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { getSeekerProfileByUserId } from "@igbo/db/queries/portal-seeker-profiles";
import { getSeekerPreferencesByProfileId } from "@igbo/db/queries/portal-seeker-preferences";
import { getJobPostingsForMatching } from "@igbo/db/queries/portal-job-search";
import { computeMatchScore } from "@/services/match-scoring-service";
import { GET } from "./route";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockGetProfile = getSeekerProfileByUserId as unknown as ReturnType<typeof vi.fn>;
const mockGetPrefs = getSeekerPreferencesByProfileId as unknown as ReturnType<typeof vi.fn>;
const mockGetPostings = getJobPostingsForMatching as unknown as ReturnType<typeof vi.fn>;
const mockComputeScore = computeMatchScore as unknown as ReturnType<typeof vi.fn>;

const VALID_UUID_1 = "00000000-0000-0000-0000-000000000001";
const VALID_UUID_2 = "00000000-0000-0000-0000-000000000002";

const seekerSession = {
  user: { id: "user-123", activePortalRole: "JOB_SEEKER" },
};

const sampleProfile = {
  id: "profile-uuid",
  userId: "user-123",
  skills: ["JavaScript", "React"],
  consentMatching: true,
};

const samplePrefs = {
  seekerProfileId: "profile-uuid",
  locations: ["Lagos"],
  workModes: ["remote"],
};

const samplePosting = {
  id: VALID_UUID_1,
  requirements: "JavaScript React",
  location: "Lagos, Nigeria",
  employmentType: "full_time",
};

const sampleScore = {
  score: 85,
  tier: "strong",
  signals: { skillsOverlap: 60, locationMatch: true, employmentTypeMatch: true },
};

function makeRequest(jobIds?: string): Request {
  const url = `http://localhost/api/v1/jobs/match-scores${jobIds !== undefined ? `?jobIds=${jobIds}` : ""}`;
  return new Request(url, { method: "GET" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(seekerSession);
  mockGetProfile.mockResolvedValue(sampleProfile);
  mockGetPrefs.mockResolvedValue(samplePrefs);
  mockGetPostings.mockResolvedValue([samplePosting]);
  mockComputeScore.mockReturnValue(sampleScore);
});

describe("GET /api/v1/jobs/match-scores", () => {
  it("returns 401 for unauthenticated request", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest(VALID_UUID_1));
    expect(res.status).toBe(401);
  });

  it("returns 400 when jobIds param is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("jobIds");
  });

  it("returns 400 for more than 50 job IDs", async () => {
    const manyIds = Array.from(
      { length: 51 },
      (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    ).join(",");
    const res = await GET(makeRequest(manyIds));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("50");
  });

  it("returns 400 for invalid UUID format", async () => {
    const res = await GET(makeRequest("not-a-uuid"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("UUID");
  });

  it("returns empty scores for non-seeker role", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-123", activePortalRole: "EMPLOYER" },
    });
    const res = await GET(makeRequest(VALID_UUID_1));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.scores).toEqual({});
  });

  it("returns empty scores when no seeker profile", async () => {
    mockGetProfile.mockResolvedValue(null);
    const res = await GET(makeRequest(VALID_UUID_1));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.scores).toEqual({});
  });

  it("returns empty scores when consentMatching is false", async () => {
    mockGetProfile.mockResolvedValue({ ...sampleProfile, consentMatching: false });
    const res = await GET(makeRequest(VALID_UUID_1));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.scores).toEqual({});
  });

  it("returns computed scores for valid request", async () => {
    const res = await GET(makeRequest(VALID_UUID_1));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.scores[VALID_UUID_1]).toEqual(sampleScore);
    expect(mockComputeScore).toHaveBeenCalledOnce();
  });

  it("returns scores for multiple valid job IDs", async () => {
    const posting2 = { ...samplePosting, id: VALID_UUID_2 };
    mockGetPostings.mockResolvedValue([samplePosting, posting2]);
    mockComputeScore.mockReturnValue(sampleScore);

    const res = await GET(makeRequest(`${VALID_UUID_1},${VALID_UUID_2}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.data.scores)).toHaveLength(2);
  });

  it("handles null preferences gracefully (no prefs row)", async () => {
    mockGetPrefs.mockResolvedValue(null);
    const res = await GET(makeRequest(VALID_UUID_1));
    expect(res.status).toBe(200);
    expect(mockComputeScore).toHaveBeenCalledWith(expect.any(Object), null, expect.any(Object));
  });
});
