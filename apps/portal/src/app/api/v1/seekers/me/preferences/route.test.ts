// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-seeker-profiles", () => ({
  getSeekerProfileByUserId: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-seeker-preferences", () => ({
  getSeekerPreferencesByProfileId: vi.fn(),
  upsertSeekerPreferences: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { getSeekerProfileByUserId } from "@igbo/db/queries/portal-seeker-profiles";
import {
  getSeekerPreferencesByProfileId,
  upsertSeekerPreferences,
} from "@igbo/db/queries/portal-seeker-preferences";
import { GET, PUT } from "./route";

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
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrefs = {
  id: "pref-uuid",
  seekerProfileId: "profile-uuid",
  desiredRoles: ["Engineer"],
  salaryMin: 200000,
  salaryMax: 500000,
  salaryCurrency: "NGN",
  locations: ["Lagos"],
  workModes: ["remote"],
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeRequest(body: unknown, method = "PUT"): Request {
  return new Request("https://jobs.igbo.com/api/v1/seekers/me/preferences", {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
    },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(): Request {
  return new Request("https://jobs.igbo.com/api/v1/seekers/me/preferences", {
    method: "GET",
    headers: { Origin: "https://jobs.igbo.com", Host: "jobs.igbo.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
});

describe("GET /api/v1/seekers/me/preferences", () => {
  it("returns null when no preferences row exists", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(getSeekerPreferencesByProfileId).mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeNull();
  });

  it("returns preferences row when present", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(getSeekerPreferencesByProfileId).mockResolvedValue(mockPrefs);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.desiredRoles).toEqual(["Engineer"]);
  });

  it("returns 403 for non-seeker role", async () => {
    vi.mocked(auth).mockResolvedValue(
      employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });

  it("returns 404 SEEKER_PROFILE_REQUIRED when seeker has no profile", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED");
  });
});

describe("PUT /api/v1/seekers/me/preferences", () => {
  it("returns 200 and upserts on first call", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(upsertSeekerPreferences).mockResolvedValue(mockPrefs);
    const res = await PUT(
      makeRequest({
        desiredRoles: ["Engineer"],
        salaryCurrency: "NGN",
        locations: ["Lagos"],
        workModes: ["remote"],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.desiredRoles).toEqual(["Engineer"]);
  });

  it("returns 200 and updates on second call", async () => {
    const updated = { ...mockPrefs, desiredRoles: ["Manager"] };
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(upsertSeekerPreferences).mockResolvedValue(updated);
    const res = await PUT(
      makeRequest({
        desiredRoles: ["Manager"],
        salaryCurrency: "NGN",
        locations: [],
        workModes: [],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.desiredRoles).toEqual(["Manager"]);
  });

  it("returns 400 when salaryMin > salaryMax", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    const res = await PUT(
      makeRequest({
        desiredRoles: [],
        salaryMin: 500000,
        salaryMax: 200000,
        salaryCurrency: "NGN",
        locations: [],
        workModes: [],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when workModes contains invalid value", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    const res = await PUT(
      makeRequest({
        desiredRoles: [],
        salaryCurrency: "NGN",
        locations: [],
        workModes: ["freelance"],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-seeker role", async () => {
    vi.mocked(auth).mockResolvedValue(
      employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    const res = await PUT(
      makeRequest({ desiredRoles: [], salaryCurrency: "NGN", locations: [], workModes: [] }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 SEEKER_PROFILE_REQUIRED when no profile", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(null);
    const res = await PUT(
      makeRequest({ desiredRoles: [], salaryCurrency: "NGN", locations: [], workModes: [] }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED");
  });
});
