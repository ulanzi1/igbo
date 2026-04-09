// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@/services/seeker-analytics-service", () => ({
  getSeekerAnalytics: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { getSeekerAnalytics } from "@/services/seeker-analytics-service";
import { GET } from "./route";

const seekerSession = {
  user: { id: "seeker-123", activePortalRole: "JOB_SEEKER" },
};

const analyticsData = {
  profileViews: 5,
  totalApplications: 3,
  statusCounts: { active: 2, interviews: 1, offers: 0, rejected: 0, withdrawn: 0 },
};

function makeGetRequest(): Request {
  return new Request("https://jobs.igbo.com/api/v1/seekers/me/analytics", {
    method: "GET",
    headers: {
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(seekerSession as never);
  vi.mocked(getSeekerAnalytics).mockResolvedValue(analyticsData);
});

describe("GET /api/v1/seekers/me/analytics", () => {
  it("returns 200 with analytics data for authenticated seeker", async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: typeof analyticsData };
    expect(body.data.profileViews).toBe(5);
    expect(body.data.totalApplications).toBe(3);
    expect(body.data.statusCounts.active).toBe(2);
    expect(getSeekerAnalytics).toHaveBeenCalledWith("seeker-123");
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-seeker role (employer)", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "emp-1", activePortalRole: "EMPLOYER" },
    } as never);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });

  it("returns 404 when no seeker profile exists", async () => {
    vi.mocked(getSeekerAnalytics).mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(404);
  });
});
