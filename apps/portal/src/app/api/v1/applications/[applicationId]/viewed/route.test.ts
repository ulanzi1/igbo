// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@/services/application-view-service", () => ({
  recordApplicationView: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { recordApplicationView } from "@/services/application-view-service";
import { POST } from "./route";

const VALID_APP_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const EMPLOYER_ID = "employer-1";

const employerSession = {
  user: { id: EMPLOYER_ID, activePortalRole: "EMPLOYER" },
};
const seekerSession = {
  user: { id: "seeker-1", activePortalRole: "JOB_SEEKER" },
};

function makeReq(appId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/applications/${appId}/viewed`, {
    method: "POST",
    headers: {
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
    },
  });
}

describe("POST /api/v1/applications/[applicationId]/viewed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 on first view", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValue(employerSession as any);
    vi.mocked(recordApplicationView).mockResolvedValue({ isFirstView: true });
    const res = await POST(makeReq(VALID_APP_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ok).toBe(true);
  });

  it("returns 204 on duplicate view", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValue(employerSession as any);
    vi.mocked(recordApplicationView).mockResolvedValue({ isFirstView: false });
    const res = await POST(makeReq(VALID_APP_ID));
    expect(res.status).toBe(204);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(makeReq(VALID_APP_ID));
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is JOB_SEEKER", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValue(seekerSession as any);
    const res = await POST(makeReq(VALID_APP_ID));
    expect(res.status).toBe(403);
  });

  it("returns 403 when role is JOB_ADMIN", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const res = await POST(makeReq(VALID_APP_ID));
    expect(res.status).toBe(403);
  });

  it("returns 404 when application not found", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValue(employerSession as any);
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(recordApplicationView).mockRejectedValue(
      new ApiError({ title: "Application not found", status: 404 }),
    );
    const res = await POST(makeReq(VALID_APP_ID));
    expect(res.status).toBe(404);
  });

  it("returns 403 when employer is unauthorized for the application", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValue(employerSession as any);
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(recordApplicationView).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );
    const res = await POST(makeReq(VALID_APP_ID));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid UUID applicationId", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValue(employerSession as any);
    const res = await POST(makeReq("not-a-uuid"));
    expect(res.status).toBe(400);
  });
});
