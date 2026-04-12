// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-applications", () => ({
  getApplicationsByIds: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyByOwnerId: vi.fn(),
}));
vi.mock("@/services/application-state-machine", async () => {
  const { VALID_TRANSITIONS } = await vi.importActual<
    typeof import("@/services/application-state-machine")
  >("@/services/application-state-machine");
  return {
    VALID_TRANSITIONS,
    transition: vi.fn(),
  };
});

import { auth } from "@igbo/auth";
import { getApplicationsByIds } from "@igbo/db/queries/portal-applications";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { transition } from "@/services/application-state-machine";
import { PATCH } from "./route";

const EMPLOYER_ID = "employer-1";
const COMPANY_ID = "cp-1";
const APP1 = "a1111111-1111-4111-a111-111111111111";
const APP2 = "a2222222-2222-4222-a222-222222222222";
const APP3 = "a3333333-3333-4333-a333-333333333333";

const employerSession = {
  user: { id: EMPLOYER_ID, activePortalRole: "EMPLOYER" },
};

const mockCompany = {
  id: COMPANY_ID,
  ownerUserId: EMPLOYER_ID,
} as unknown as Awaited<ReturnType<typeof getCompanyByOwnerId>>;

function makeRequest(body: unknown): Request {
  return new Request("https://jobs.igbo.com/api/v1/applications/bulk/status", {
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
  vi.mocked(getCompanyByOwnerId).mockResolvedValue(mockCompany);
  vi.mocked(transition).mockResolvedValue(undefined);
});

describe("PATCH /api/v1/applications/bulk/status", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await PATCH(makeRequest({ applicationIds: [APP1], action: "reject" }));
    expect(res.status).toBe(401);
    expect(transition).not.toHaveBeenCalled();
  });

  it("returns 403 when role is not EMPLOYER", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "seeker-1", activePortalRole: "JOB_SEEKER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    const res = await PATCH(makeRequest({ applicationIds: [APP1], action: "reject" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when applicationIds is empty", async () => {
    const res = await PATCH(makeRequest({ applicationIds: [], action: "reject" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when applicationIds exceeds 50", async () => {
    const ids = Array.from(
      { length: 51 },
      (_, i) => `a${String(i).padStart(7, "0")}-1111-4111-a111-111111111111`,
    );
    const res = await PATCH(makeRequest({ applicationIds: ids, action: "reject" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when action is invalid", async () => {
    const res = await PATCH(makeRequest({ applicationIds: [APP1], action: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when employer has no company", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
    const res = await PATCH(makeRequest({ applicationIds: [APP1], action: "reject" }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when any application id is not owned (fail-closed)", async () => {
    vi.mocked(getApplicationsByIds).mockResolvedValue([
      {
        id: APP1,
        status: "submitted",
        jobId: "jp-1",
        seekerUserId: "s-1",
        companyId: COMPANY_ID,
      },
    ]);
    // Request has 2 ids but only 1 owned — fail-closed
    const res = await PATCH(makeRequest({ applicationIds: [APP1, APP2], action: "reject" }));
    expect(res.status).toBe(404);
    expect(transition).not.toHaveBeenCalled();
  });

  it("bulk reject: transitions all applications and returns processed count", async () => {
    vi.mocked(getApplicationsByIds).mockResolvedValue([
      { id: APP1, status: "submitted", jobId: "jp-1", seekerUserId: "s-1", companyId: COMPANY_ID },
      {
        id: APP2,
        status: "under_review",
        jobId: "jp-1",
        seekerUserId: "s-2",
        companyId: COMPANY_ID,
      },
    ]);
    const res = await PATCH(
      makeRequest({ applicationIds: [APP1, APP2], action: "reject", reason: "Pos filled" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.processed).toBe(2);
    expect(body.data.skipped).toBe(0);
    expect(transition).toHaveBeenCalledTimes(2);
    expect(transition).toHaveBeenCalledWith(
      APP1,
      "rejected",
      EMPLOYER_ID,
      "employer",
      "Pos filled",
    );
  });

  it("bulk reject: terminal-state candidates are pre-filtered and skipped without calling transition", async () => {
    vi.mocked(getApplicationsByIds).mockResolvedValue([
      { id: APP1, status: "submitted", jobId: "jp-1", seekerUserId: "s-1", companyId: COMPANY_ID },
      { id: APP2, status: "withdrawn", jobId: "jp-1", seekerUserId: "s-2", companyId: COMPANY_ID },
    ]);
    const res = await PATCH(makeRequest({ applicationIds: [APP1, APP2], action: "reject" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.processed).toBe(1);
    expect(body.data.skipped).toBe(1);
    // transition should only be called for APP1 (not terminal)
    expect(transition).toHaveBeenCalledTimes(1);
    expect(transition).toHaveBeenCalledWith(APP1, "rejected", EMPLOYER_ID, "employer", undefined);
    const skippedItem = body.data.results.find(
      (r: { applicationId: string }) => r.applicationId === APP2,
    );
    expect(skippedItem.status).toBe("skipped");
  });

  it("bulk advance: moves submitted→under_review, interview→offered", async () => {
    vi.mocked(getApplicationsByIds).mockResolvedValue([
      { id: APP1, status: "submitted", jobId: "jp-1", seekerUserId: "s-1", companyId: COMPANY_ID },
      { id: APP2, status: "interview", jobId: "jp-1", seekerUserId: "s-2", companyId: COMPANY_ID },
    ]);
    const res = await PATCH(makeRequest({ applicationIds: [APP1, APP2], action: "advance" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.processed).toBe(2);
    expect(transition).toHaveBeenCalledWith(
      APP1,
      "under_review",
      EMPLOYER_ID,
      "employer",
      undefined,
    );
    expect(transition).toHaveBeenCalledWith(APP2, "offered", EMPLOYER_ID, "employer", undefined);
  });

  it("bulk advance: skips applications already in terminal state (no next stage)", async () => {
    vi.mocked(getApplicationsByIds).mockResolvedValue([
      { id: APP1, status: "submitted", jobId: "jp-1", seekerUserId: "s-1", companyId: COMPANY_ID },
      { id: APP2, status: "hired", jobId: "jp-1", seekerUserId: "s-2", companyId: COMPANY_ID },
      { id: APP3, status: "rejected", jobId: "jp-1", seekerUserId: "s-3", companyId: COMPANY_ID },
    ]);
    const res = await PATCH(makeRequest({ applicationIds: [APP1, APP2, APP3], action: "advance" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.processed).toBe(1);
    expect(body.data.skipped).toBe(2);
    // transition called exactly once (for APP1)
    expect(transition).toHaveBeenCalledTimes(1);
    expect(transition).toHaveBeenCalledWith(
      APP1,
      "under_review",
      EMPLOYER_ID,
      "employer",
      undefined,
    );
  });

  it("applies reason to all rejected applications", async () => {
    vi.mocked(getApplicationsByIds).mockResolvedValue([
      { id: APP1, status: "submitted", jobId: "jp-1", seekerUserId: "s-1", companyId: COMPANY_ID },
      { id: APP2, status: "interview", jobId: "jp-1", seekerUserId: "s-2", companyId: COMPANY_ID },
    ]);
    await PATCH(
      makeRequest({
        applicationIds: [APP1, APP2],
        action: "reject",
        reason: "Position filled",
      }),
    );
    expect(transition).toHaveBeenCalledWith(
      APP1,
      "rejected",
      EMPLOYER_ID,
      "employer",
      "Position filled",
    );
    expect(transition).toHaveBeenCalledWith(
      APP2,
      "rejected",
      EMPLOYER_ID,
      "employer",
      "Position filled",
    );
  });
});
