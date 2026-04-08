// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-seeker-profiles", () => ({
  getSeekerProfileByUserId: vi.fn(),
  updateSeekerConsent: vi.fn(),
}));

import { auth } from "@igbo/auth";
import {
  getSeekerProfileByUserId,
  updateSeekerConsent,
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
  onboardingCompletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeRequest(body: unknown): Request {
  return new Request("https://jobs.igbo.com/api/v1/seekers/me/consent", {
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

describe("PATCH /api/v1/seekers/me/consent", () => {
  it("grants matching consent and returns updated profile", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(updateSeekerConsent).mockResolvedValue({
      ...mockProfile,
      consentMatching: true,
    } as Awaited<ReturnType<typeof updateSeekerConsent>>);
    const res = await PATCH(makeRequest({ consentMatching: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.consentMatching).toBe(true);
  });

  it("grants employer view consent and returns updated profile", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(updateSeekerConsent).mockResolvedValue({
      ...mockProfile,
      consentEmployerView: true,
    } as Awaited<ReturnType<typeof updateSeekerConsent>>);
    const res = await PATCH(makeRequest({ consentEmployerView: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.consentEmployerView).toBe(true);
  });

  it("updates both consent fields in one request", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(updateSeekerConsent).mockResolvedValue({
      ...mockProfile,
      consentMatching: true,
      consentEmployerView: true,
    } as Awaited<ReturnType<typeof updateSeekerConsent>>);
    const res = await PATCH(makeRequest({ consentMatching: true, consentEmployerView: true }));
    expect(res.status).toBe(200);
    expect(vi.mocked(updateSeekerConsent)).toHaveBeenCalledWith(
      "user-1",
      { consentMatching: true, consentEmployerView: true },
      expect.any(Array),
    );
  });

  it("builds audit entries with AC8 format for consent changes", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(updateSeekerConsent).mockResolvedValue({
      ...mockProfile,
      consentMatching: true,
    } as Awaited<ReturnType<typeof updateSeekerConsent>>);
    await PATCH(makeRequest({ consentMatching: true }));
    const [, , auditEntries] = vi.mocked(updateSeekerConsent).mock.calls[0]!;
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0]).toMatchObject({
      action: "portal.seeker.consent.matching.changed",
      actorId: "user-1",
      targetUserId: "user-1",
      targetType: "portal_seeker_profile",
      details: { from: false, to: true, seekerProfileId: "profile-uuid" },
    });
  });

  it("does NOT write audit entry when value is unchanged", async () => {
    const alreadyConsented = { ...mockProfile, consentMatching: true };
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(alreadyConsented);
    const res = await PATCH(makeRequest({ consentMatching: true }));
    expect(res.status).toBe(200);
    // updateSeekerConsent should NOT be called since nothing changed
    expect(vi.mocked(updateSeekerConsent)).not.toHaveBeenCalled();
  });

  it("returns 400 when no consent fields are provided", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    const res = await PATCH(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-seeker role", async () => {
    vi.mocked(auth).mockResolvedValue(
      employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    const res = await PATCH(makeRequest({ consentMatching: true }));
    expect(res.status).toBe(403);
  });

  it("returns 404 SEEKER_PROFILE_REQUIRED when no profile", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(null);
    const res = await PATCH(makeRequest({ consentMatching: true }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED");
  });
});
