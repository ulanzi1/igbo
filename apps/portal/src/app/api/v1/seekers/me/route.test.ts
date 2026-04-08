// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-seeker-profiles", () => ({
  getSeekerProfileByUserId: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { getSeekerProfileByUserId } from "@igbo/db/queries/portal-seeker-profiles";
import { GET } from "./route";

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
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
});

function makeGetRequest(): Request {
  return new Request("https://jobs.igbo.com/api/v1/seekers/me", {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

describe("GET /api/v1/seekers/me", () => {
  it("returns own profile when it exists", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("seeker-uuid");
  });

  it("returns null when profile does not exist", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeNull();
  });

  it("returns 403 for non-seeker role", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-456", activePortalRole: "EMPLOYER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });
});
