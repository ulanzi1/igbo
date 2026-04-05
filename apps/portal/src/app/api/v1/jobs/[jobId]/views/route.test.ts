// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@/services/job-analytics-service", () => ({
  trackJobView: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { trackJobView } from "@/services/job-analytics-service";
import { POST } from "./route";

const authenticatedSession = {
  user: { id: "user-123", activePortalRole: "JOB_SEEKER" },
};

function makePostRequest(jobId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/jobs/${jobId}/views`, {
    method: "POST",
    headers: {
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(authenticatedSession as never);
  vi.mocked(trackJobView).mockResolvedValue(true);
});

describe("POST /api/v1/jobs/[jobId]/views", () => {
  it("tracks a view for an authenticated user and returns tracked:true", async () => {
    const res = await POST(makePostRequest("jp-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { tracked: boolean } };
    expect(body.data.tracked).toBe(true);
    expect(trackJobView).toHaveBeenCalledWith("jp-1", "user-123");
  });

  it("returns tracked:false for a deduplicated view", async () => {
    vi.mocked(trackJobView).mockResolvedValue(false);
    const res = await POST(makePostRequest("jp-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { tracked: boolean } };
    expect(body.data.tracked).toBe(false);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(makePostRequest("jp-1"));
    expect(res.status).toBe(401);
  });

  it("rejects requests without CSRF Origin header", async () => {
    const req = new Request("https://jobs.igbo.com/api/v1/jobs/jp-1/views", {
      method: "POST",
      headers: { Host: "jobs.igbo.com" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("passes jobId extracted from URL at position -2", async () => {
    const res = await POST(makePostRequest("my-job-uuid"));
    expect(res.status).toBe(200);
    expect(trackJobView).toHaveBeenCalledWith("my-job-uuid", "user-123");
  });
});
