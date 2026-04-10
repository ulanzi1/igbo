// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/portal-permissions", () => ({
  requireEmployerRole: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-applications", () => ({
  getApplicationWithCurrentStatus: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyByOwnerId: vi.fn(),
}));
vi.mock("@/services/application-state-machine", () => ({
  transition: vi.fn(),
}));

import { requireEmployerRole } from "@/lib/portal-permissions";
import { getApplicationWithCurrentStatus } from "@igbo/db/queries/portal-applications";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { transition } from "@/services/application-state-machine";
import { PATCH } from "./route";

type EmployerSession = { user: { id: string; activePortalRole: string } };
const employerSession: EmployerSession = {
  user: { id: "employer-1", activePortalRole: "EMPLOYER" },
};

const VALID_APP_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const mockCompany = { id: "company-1", ownerUserId: "employer-1", name: "Acme Corp" };
const mockApplication = {
  id: VALID_APP_ID,
  status: "submitted" as const,
  jobId: "jp-1",
  seekerUserId: "seeker-1",
  companyId: "company-1",
};

function makePatchRequest(applicationId: string, body: unknown): Request {
  return new Request(`https://jobs.igbo.com/api/v1/applications/${applicationId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Host: "jobs.igbo.com",
      Origin: "https://jobs.igbo.com",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireEmployerRole).mockResolvedValue(
    employerSession as ReturnType<typeof requireEmployerRole> extends Promise<infer T> ? T : never,
  );
  vi.mocked(getCompanyByOwnerId).mockResolvedValue(mockCompany as never);
  vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(mockApplication as never);
  vi.mocked(transition).mockResolvedValue(undefined);
});

describe("PATCH /api/v1/applications/[applicationId]/status", () => {
  it("returns 200 on valid transition", async () => {
    const res = await PATCH(makePatchRequest(VALID_APP_ID, { status: "under_review" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.applicationId).toBe(VALID_APP_ID);
    expect(body.data.status).toBe("under_review");
  });

  it("calls transition with correct args including 'employer' actor role", async () => {
    await PATCH(makePatchRequest(VALID_APP_ID, { status: "under_review" }));
    expect(transition).toHaveBeenCalledWith(VALID_APP_ID, "under_review", "employer-1", "employer");
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(requireEmployerRole).mockRejectedValue(
      new ApiError({ title: "Authentication required", status: 401 }),
    );
    const res = await PATCH(makePatchRequest(VALID_APP_ID, { status: "under_review" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not EMPLOYER", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(requireEmployerRole).mockRejectedValue(
      new ApiError({ title: "Employer role required", status: 403 }),
    );
    const res = await PATCH(makePatchRequest(VALID_APP_ID, { status: "under_review" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for non-UUID applicationId", async () => {
    const res = await PATCH(makePatchRequest("not-a-uuid", { status: "under_review" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when status is missing from body", async () => {
    const res = await PATCH(makePatchRequest(VALID_APP_ID, {}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when application not found", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(null);
    const res = await PATCH(makePatchRequest(VALID_APP_ID, { status: "under_review" }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when application belongs to a different company", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue({
      ...mockApplication,
      companyId: "other-company",
    });
    const res = await PATCH(makePatchRequest(VALID_APP_ID, { status: "under_review" }));
    expect(res.status).toBe(404);
  });

  it("returns 409 on invalid transition (state machine throws)", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(transition).mockRejectedValue(
      new ApiError({ title: "Invalid status transition: submitted → offered", status: 409 }),
    );
    const res = await PATCH(makePatchRequest(VALID_APP_ID, { status: "offered" }));
    expect(res.status).toBe(409);
  });
});
