// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-applications", () => ({
  getApplicationWithCurrentStatus: vi.fn(),
}));
vi.mock("@/services/application-state-machine", () => ({
  transition: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { getApplicationWithCurrentStatus } from "@igbo/db/queries/portal-applications";
import { transition } from "@/services/application-state-machine";
import { POST } from "./route";

const VALID_APP_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const SEEKER_ID = "seeker-1";

const seekerSession = {
  user: { id: SEEKER_ID, activePortalRole: "JOB_SEEKER" },
};

const mockApplication = {
  id: VALID_APP_ID,
  status: "submitted" as const,
  jobId: "jp-1",
  seekerUserId: SEEKER_ID,
  companyId: "cp-1",
};

function makeRequest(
  applicationId: string,
  body: unknown = {},
  extraHeaders: Record<string, string> = {},
): Request {
  return new Request(`https://jobs.igbo.com/api/v1/applications/${applicationId}/withdraw`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
  vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(mockApplication);
  vi.mocked(transition).mockResolvedValue(undefined);
});

describe("POST /api/v1/applications/[applicationId]/withdraw", () => {
  it("returns 200 on successful withdrawal without reason", async () => {
    const res = await POST(makeRequest(VALID_APP_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.applicationId).toBe(VALID_APP_ID);
    expect(body.data.status).toBe("withdrawn");
  });

  it("returns 200 on successful withdrawal with reason", async () => {
    const res = await POST(makeRequest(VALID_APP_ID, { reason: "Changed my mind" }));
    expect(res.status).toBe(200);
    expect(transition).toHaveBeenCalledWith(
      VALID_APP_ID,
      "withdrawn",
      SEEKER_ID,
      "job_seeker",
      "Changed my mind",
    );
  });

  it("calls transition with trimmed reason", async () => {
    await POST(makeRequest(VALID_APP_ID, { reason: "  trimmed  " }));
    expect(transition).toHaveBeenCalledWith(
      VALID_APP_ID,
      "withdrawn",
      SEEKER_ID,
      "job_seeker",
      "trimmed",
    );
  });

  it("calls transition with undefined reason when reason is not provided", async () => {
    await POST(makeRequest(VALID_APP_ID, {}));
    expect(transition).toHaveBeenCalledWith(
      VALID_APP_ID,
      "withdrawn",
      SEEKER_ID,
      "job_seeker",
      undefined,
    );
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(makeRequest(VALID_APP_ID));
    expect(res.status).toBe(401);
    expect(transition).not.toHaveBeenCalled();
  });

  it("returns 403 when role is not JOB_SEEKER", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "employer-1", activePortalRole: "EMPLOYER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    const res = await POST(makeRequest(VALID_APP_ID));
    expect(res.status).toBe(403);
    expect(transition).not.toHaveBeenCalled();
  });

  it("returns 400 when applicationId is not a valid UUID", async () => {
    const res = await POST(makeRequest("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(getApplicationWithCurrentStatus).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
  });

  it("returns 404 when application not found", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(null);
    const res = await POST(makeRequest(VALID_APP_ID));
    expect(res.status).toBe(404);
    expect(transition).not.toHaveBeenCalled();
  });

  it("returns 404 (not 403) when application belongs to different seeker", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue({
      ...mockApplication,
      seekerUserId: "other-seeker",
    });
    const res = await POST(makeRequest(VALID_APP_ID));
    expect(res.status).toBe(404);
    expect(transition).not.toHaveBeenCalled();
  });

  it("returns 409 when application is in terminal state (state machine throws)", async () => {
    const { ApiError } = await import("@igbo/auth/api-error");
    vi.mocked(transition).mockRejectedValue(
      new ApiError({
        title: "Invalid status transition — application is in a terminal state",
        status: 409,
        extensions: { code: "PORTAL_ERRORS.INVALID_STATUS_TRANSITION" },
      }),
    );
    const res = await POST(makeRequest(VALID_APP_ID));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.INVALID_STATUS_TRANSITION");
  });

  it("returns 400 when reason exceeds 500 chars", async () => {
    const res = await POST(makeRequest(VALID_APP_ID, { reason: "x".repeat(501) }));
    expect(res.status).toBe(400);
    expect(transition).not.toHaveBeenCalled();
  });

  it("calls transition with correct 5 args including reason", async () => {
    await POST(makeRequest(VALID_APP_ID, { reason: "Not a fit" }));
    expect(transition).toHaveBeenCalledWith(
      VALID_APP_ID,
      "withdrawn",
      SEEKER_ID,
      "job_seeker",
      "Not a fit",
    );
  });

  it("verifies event is emitted via transition (not bypassed)", async () => {
    // transition() emits the event internally — calling it once is the evidence
    await POST(makeRequest(VALID_APP_ID, { reason: "Moving on" }));
    expect(transition).toHaveBeenCalledTimes(1);
  });

  it("calls getApplicationWithCurrentStatus with the applicationId", async () => {
    await POST(makeRequest(VALID_APP_ID));
    expect(getApplicationWithCurrentStatus).toHaveBeenCalledWith(VALID_APP_ID);
  });
});
