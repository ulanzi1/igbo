// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/portal-permissions", () => ({
  requireJobSeekerRole: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-applications", () => ({
  getApplicationDetailForSeeker: vi.fn(),
  getTransitionHistory: vi.fn(),
}));

import { requireJobSeekerRole } from "@/lib/portal-permissions";
import {
  getApplicationDetailForSeeker,
  getTransitionHistory,
} from "@igbo/db/queries/portal-applications";
import { GET } from "./route";

const seekerSession = { user: { id: "seeker-1", activePortalRole: "JOB_SEEKER" } };

const mockApplication = {
  id: "app-1",
  jobId: "jp-1",
  seekerUserId: "seeker-1",
  status: "submitted",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  coverLetterText: null,
  portfolioLinksJson: [],
  selectedCvId: null,
  jobTitle: "Senior Engineer",
  companyId: "cp-1",
  companyName: "Acme Corp",
  cvLabel: null,
};

const mockTransitions = [
  {
    id: "tr-1",
    applicationId: "app-1",
    fromStatus: "submitted",
    toStatus: "under_review",
    actorUserId: "employer-1",
    actorRole: "employer",
    reason: null,
    createdAt: new Date("2026-01-02"),
  },
];

function makeGetRequest(applicationId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/applications/${applicationId}`, {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireJobSeekerRole).mockResolvedValue(
    seekerSession as ReturnType<typeof requireJobSeekerRole> extends Promise<infer T> ? T : never,
  );
  vi.mocked(getApplicationDetailForSeeker).mockResolvedValue(mockApplication as never);
  vi.mocked(getTransitionHistory).mockResolvedValue(mockTransitions as never);
});

describe("GET /api/v1/applications/[applicationId]", () => {
  it("returns application with transitions for the owning seeker (200)", async () => {
    const res = await GET(makeGetRequest("app-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.application.id).toBe("app-1");
    expect(body.data.application.jobTitle).toBe("Senior Engineer");
    expect(body.data.transitions).toHaveLength(1);
  });

  it("returns 401 when not authenticated (requireJobSeekerRole throws)", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(requireJobSeekerRole).mockRejectedValue(
      new ApiError({ title: "Authentication required", status: 401 }),
    );
    const res = await GET(makeGetRequest("app-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not JOB_SEEKER", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(requireJobSeekerRole).mockRejectedValue(
      new ApiError({ title: "Job seeker role required", status: 403 }),
    );
    const res = await GET(makeGetRequest("app-1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when application not found", async () => {
    vi.mocked(getApplicationDetailForSeeker).mockResolvedValue(null);
    const res = await GET(makeGetRequest("app-999"));
    expect(res.status).toBe(404);
  });

  it("returns 404 (not 403) when application belongs to a different seeker", async () => {
    // The DB query returns null if seekerUserId doesn't match
    vi.mocked(getApplicationDetailForSeeker).mockResolvedValue(null);
    const res = await GET(makeGetRequest("app-1"));
    expect(res.status).toBe(404);
  });

  it("calls getApplicationDetailForSeeker with correct args", async () => {
    await GET(makeGetRequest("app-1"));
    expect(getApplicationDetailForSeeker).toHaveBeenCalledWith("app-1", "seeker-1");
  });

  it("calls getTransitionHistory with applicationId", async () => {
    await GET(makeGetRequest("app-1"));
    expect(getTransitionHistory).toHaveBeenCalledWith("app-1");
  });

  it("returns empty transitions array when no transitions exist", async () => {
    vi.mocked(getTransitionHistory).mockResolvedValue([]);
    const res = await GET(makeGetRequest("app-1"));
    const body = await res.json();
    expect(body.data.transitions).toHaveLength(0);
  });
});
