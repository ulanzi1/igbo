// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-seeker-profiles", () => ({
  getSeekerProfileById: vi.fn(),
  updateSeekerProfile: vi.fn(),
}));
vi.mock("@igbo/db/queries/cross-app", () => ({
  getSeekerTrustSignals: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { getSeekerProfileById, updateSeekerProfile } from "@igbo/db/queries/portal-seeker-profiles";
import { getSeekerTrustSignals } from "@igbo/db/queries/cross-app";
import { GET, PATCH } from "./route";

const employerSession = {
  user: { id: "employer-123", activePortalRole: "EMPLOYER" },
};

const adminSession = {
  user: { id: "admin-123", activePortalRole: "JOB_ADMIN" },
};

const seekerSession = {
  user: { id: "seeker-123", activePortalRole: "JOB_SEEKER" },
};

const mockProfile = {
  id: "seeker-uuid",
  userId: "seeker-123",
  headline: "Senior Engineer",
  summary: "Building things",
  skills: ["TypeScript"],
  experienceJson: [],
  educationJson: [],
  createdAt: new Date(),
  updatedAt: new Date("2024-01-01"),
};

const mockTrustSignals = {
  isVerified: true,
  badgeType: "blue",
  memberSince: new Date("2023-01-01"),
  memberDurationDays: 365,
  communityPoints: 600,
  engagementLevel: "high" as const,
  displayName: "Chidi Okeke",
};

function makeGetRequest(seekerProfileId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/seekers/${seekerProfileId}`, {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

function makePatchRequest(seekerProfileId: string, body: unknown): Request {
  return new Request(`https://jobs.igbo.com/api/v1/seekers/${seekerProfileId}`, {
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
  vi.mocked(getSeekerTrustSignals).mockResolvedValue(mockTrustSignals);
});

describe("GET /api/v1/seekers/[seekerProfileId]", () => {
  it("employer sees seeker profile with trust signals", async () => {
    vi.mocked(getSeekerProfileById).mockResolvedValue(mockProfile);

    const res = await GET(makeGetRequest("seeker-uuid"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.headline).toBe("Senior Engineer");
    expect(body.data.trustSignals.isVerified).toBe(true);
    expect(body.data.trustSignals.badgeType).toBe("blue");
  });

  it("admin sees seeker profile with trust signals", async () => {
    vi.mocked(auth).mockResolvedValue(
      adminSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    vi.mocked(getSeekerProfileById).mockResolvedValue(mockProfile);

    const res = await GET(makeGetRequest("seeker-uuid"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.trustSignals.communityPoints).toBe(600);
  });

  it("returns 403 for JOB_SEEKER role", async () => {
    vi.mocked(auth).mockResolvedValue(
      seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );

    const res = await GET(makeGetRequest("seeker-uuid"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.ROLE_MISMATCH");
  });

  it("returns 401 for unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const res = await GET(makeGetRequest("seeker-uuid"));
    expect(res.status).toBe(401);
  });

  it("returns 404 for missing profile", async () => {
    vi.mocked(getSeekerProfileById).mockResolvedValue(null);

    const res = await GET(makeGetRequest("non-existent"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.NOT_FOUND");
  });
});

describe("PATCH /api/v1/seekers/[seekerProfileId]", () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue(
      seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
  });

  it("owner updates their profile", async () => {
    const updated = { ...mockProfile, headline: "Updated Dev" };
    vi.mocked(getSeekerProfileById).mockResolvedValue(mockProfile);
    vi.mocked(updateSeekerProfile).mockResolvedValue(updated);

    const res = await PATCH(makePatchRequest("seeker-uuid", { headline: "Updated Dev" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.headline).toBe("Updated Dev");
  });

  it("returns 403 for non-owner seeker", async () => {
    const otherSeekerProfile = { ...mockProfile, userId: "other-seeker" };
    vi.mocked(getSeekerProfileById).mockResolvedValue(otherSeekerProfile);

    const res = await PATCH(makePatchRequest("seeker-uuid", { headline: "Hijack" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 for non-seeker role", async () => {
    vi.mocked(auth).mockResolvedValue(
      employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );

    const res = await PATCH(makePatchRequest("seeker-uuid", { headline: "Test" }));
    expect(res.status).toBe(403);
  });

  it("accepts partial update (only provided fields)", async () => {
    const updated = { ...mockProfile, skills: ["Go", "Rust"] };
    vi.mocked(getSeekerProfileById).mockResolvedValue(mockProfile);
    vi.mocked(updateSeekerProfile).mockResolvedValue(updated);

    const res = await PATCH(makePatchRequest("seeker-uuid", { skills: ["Go", "Rust"] }));
    expect(res.status).toBe(200);
    expect(updateSeekerProfile).toHaveBeenCalledWith(
      "seeker-uuid",
      expect.objectContaining({ skills: ["Go", "Rust"] }),
    );
  });

  it("returns 404 for missing profile", async () => {
    vi.mocked(getSeekerProfileById).mockResolvedValue(null);

    const res = await PATCH(makePatchRequest("missing-id", { headline: "Test" }));
    expect(res.status).toBe(404);
  });

  it("updatedAt is bumped (updateSeekerProfile called)", async () => {
    const updatedAt = new Date();
    const updated = { ...mockProfile, updatedAt };
    vi.mocked(getSeekerProfileById).mockResolvedValue(mockProfile);
    vi.mocked(updateSeekerProfile).mockResolvedValue(updated);

    const res = await PATCH(makePatchRequest("seeker-uuid", { summary: "New summary" }));
    expect(res.status).toBe(200);
    expect(updateSeekerProfile).toHaveBeenCalledWith(
      "seeker-uuid",
      expect.objectContaining({ summary: "New summary" }),
    );
  });

  it("returns 400 for invalid body (headline too long)", async () => {
    vi.mocked(getSeekerProfileById).mockResolvedValue(mockProfile);

    const res = await PATCH(makePatchRequest("seeker-uuid", { headline: "x".repeat(201) }));
    expect(res.status).toBe(400);
  });
});
