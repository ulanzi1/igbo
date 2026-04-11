// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-applications", () => ({
  getApplicationWithCurrentStatus: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyByOwnerId: vi.fn(),
}));
vi.mock("@/services/application-state-machine", () => ({
  transition: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { getApplicationWithCurrentStatus } from "@igbo/db/queries/portal-applications";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { transition } from "@/services/application-state-machine";
import { PATCH } from "./route";

const VALID_APP_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const EMPLOYER_ID = "employer-1";
const COMPANY_ID = "cp-1";

const employerSession = {
  user: { id: EMPLOYER_ID, activePortalRole: "EMPLOYER" },
};

const mockApplication = {
  id: VALID_APP_ID,
  status: "submitted" as const,
  jobId: "jp-1",
  seekerUserId: "seeker-1",
  companyId: COMPANY_ID,
};

const mockCompany = {
  id: COMPANY_ID,
  ownerUserId: EMPLOYER_ID,
  name: "Acme",
} as unknown as Awaited<ReturnType<typeof getCompanyByOwnerId>>;

function makeRequest(
  applicationId: string,
  body: unknown = { status: "under_review" },
  extraHeaders: Record<string, string> = {},
): Request {
  return new Request(`https://jobs.igbo.com/api/v1/applications/${applicationId}/status`, {
    method: "PATCH",
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
    employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
  vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(mockApplication);
  vi.mocked(getCompanyByOwnerId).mockResolvedValue(mockCompany);
  vi.mocked(transition).mockResolvedValue(undefined);
});

describe("PATCH /api/v1/applications/[applicationId]/status", () => {
  it("returns 200 on successful transition", async () => {
    const res = await PATCH(makeRequest(VALID_APP_ID, { status: "under_review" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.applicationId).toBe(VALID_APP_ID);
    expect(body.data.status).toBe("under_review");
  });

  it("delegates to transition with employer actor role", async () => {
    await PATCH(makeRequest(VALID_APP_ID, { status: "shortlisted" }));
    expect(transition).toHaveBeenCalledWith(
      VALID_APP_ID,
      "shortlisted",
      EMPLOYER_ID,
      "employer",
      undefined,
    );
  });

  it("passes reason to transition when provided", async () => {
    await PATCH(makeRequest(VALID_APP_ID, { status: "rejected", reason: "Not a fit" }));
    expect(transition).toHaveBeenCalledWith(
      VALID_APP_ID,
      "rejected",
      EMPLOYER_ID,
      "employer",
      "Not a fit",
    );
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await PATCH(makeRequest(VALID_APP_ID));
    expect(res.status).toBe(401);
    expect(transition).not.toHaveBeenCalled();
  });

  it("returns 403 when role is not EMPLOYER", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "seeker-1", activePortalRole: "JOB_SEEKER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    const res = await PATCH(makeRequest(VALID_APP_ID));
    expect(res.status).toBe(403);
    expect(transition).not.toHaveBeenCalled();
  });

  it("returns 400 when applicationId is not a valid UUID", async () => {
    const res = await PATCH(makeRequest("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(getApplicationWithCurrentStatus).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
  });

  it("returns 400 when body status is missing", async () => {
    const res = await PATCH(makeRequest(VALID_APP_ID, {}));
    expect(res.status).toBe(400);
    expect(transition).not.toHaveBeenCalled();
  });

  it("returns 400 when body status is not a valid enum value", async () => {
    const res = await PATCH(makeRequest(VALID_APP_ID, { status: "bogus" }));
    expect(res.status).toBe(400);
    expect(transition).not.toHaveBeenCalled();
  });

  it("returns 400 when reason exceeds 500 chars", async () => {
    const res = await PATCH(
      makeRequest(VALID_APP_ID, { status: "under_review", reason: "x".repeat(501) }),
    );
    expect(res.status).toBe(400);
    expect(transition).not.toHaveBeenCalled();
  });

  it("returns 404 when application not found", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(null);
    const res = await PATCH(makeRequest(VALID_APP_ID));
    expect(res.status).toBe(404);
    expect(transition).not.toHaveBeenCalled();
  });

  it("returns 404 (not 403) when employer has no company", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
    const res = await PATCH(makeRequest(VALID_APP_ID));
    expect(res.status).toBe(404);
    expect(transition).not.toHaveBeenCalled();
  });

  it("returns 404 (not 403) when employer company does not own the job", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue({
      ...(mockCompany as { id: string }),
      id: "different-company",
    } as unknown as Awaited<ReturnType<typeof getCompanyByOwnerId>>);
    const res = await PATCH(makeRequest(VALID_APP_ID));
    expect(res.status).toBe(404);
    expect(transition).not.toHaveBeenCalled();
  });

  it("returns 409 when state machine rejects invalid transition", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(transition).mockRejectedValue(
      new ApiError({
        title: "Invalid status transition",
        status: 409,
        extensions: { code: "PORTAL_ERRORS.INVALID_STATUS_TRANSITION" },
      }),
    );
    const res = await PATCH(makeRequest(VALID_APP_ID, { status: "hired" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.INVALID_STATUS_TRANSITION");
  });
});
