// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-seeker-profiles", () => ({
  createSeekerProfile: vi.fn(),
  getSeekerProfileByUserId: vi.fn(),
}));

import { auth } from "@igbo/auth";
import {
  createSeekerProfile,
  getSeekerProfileByUserId,
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
  skills: ["TypeScript"],
  experienceJson: [],
  educationJson: [],
  visibility: "active",
  consentMatching: false,
  consentEmployerView: false,
  consentMatchingChangedAt: null,
  consentEmployerViewChangedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeRequest(body: unknown, method = "POST"): Request {
  return new Request("https://jobs.igbo.com/api/v1/seekers", {
    method,
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

describe("POST /api/v1/seekers", () => {
  it("creates a seeker profile and returns 201", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(null);
    vi.mocked(createSeekerProfile).mockResolvedValue(mockProfile);

    const req = makeRequest({ headline: "Senior Engineer" });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.headline).toBe("Senior Engineer");
  });

  it("returns 409 if seeker profile already exists", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);

    const req = makeRequest({ headline: "Duplicate" });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.DUPLICATE_SEEKER_PROFILE");
  });

  it("returns 403 for non-seeker role", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-456", activePortalRole: "EMPLOYER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

    const req = makeRequest({ headline: "Test" });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 401 for unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const req = makeRequest({ headline: "Test" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body (empty headline)", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(null);

    const req = makeRequest({ headline: "" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// Note: GET /api/v1/seekers (own profile) was removed — duplicate of /api/v1/seekers/me.
// See seekers/me/route.test.ts for the "own profile" endpoint tests.
