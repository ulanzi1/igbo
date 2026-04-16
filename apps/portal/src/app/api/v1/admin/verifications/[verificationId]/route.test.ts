// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({ requireJobAdminRole: vi.fn() }));
vi.mock("@igbo/db/queries/portal-employer-verifications", () => ({
  getVerificationById: vi.fn(),
  getVerificationHistoryForCompany: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-admin-flags", () => ({
  countOpenViolationsForCompany: vi.fn(),
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import {
  getVerificationById,
  getVerificationHistoryForCompany,
} from "@igbo/db/queries/portal-employer-verifications";
import { countOpenViolationsForCompany } from "@igbo/db/queries/portal-admin-flags";
import { ApiError } from "@igbo/auth/api-error";
import { GET } from "./route";

const mockVerification = {
  id: "ver-1",
  companyId: "company-1",
  submittedDocuments: [],
  status: "pending",
  adminNotes: null,
  submittedAt: new Date(),
  reviewedAt: null,
  reviewedByAdminId: null,
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireJobAdminRole).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
  vi.mocked(getVerificationById).mockResolvedValue(mockVerification as never);
  vi.mocked(getVerificationHistoryForCompany).mockResolvedValue([mockVerification] as never);
  vi.mocked(countOpenViolationsForCompany).mockResolvedValue(0);
});

describe("GET /api/v1/admin/verifications/[verificationId]", () => {
  it("returns verification detail with history and violation count", async () => {
    const req = new Request("https://jobs.igbo.com/api/v1/admin/verifications/ver-1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("ver-1");
    expect(body.data.openViolationCount).toBe(0);
    expect(body.data.history).toHaveLength(1);
  });

  it("includes open violation count in response", async () => {
    vi.mocked(countOpenViolationsForCompany).mockResolvedValue(3);
    const req = new Request("https://jobs.igbo.com/api/v1/admin/verifications/ver-1");
    const res = await GET(req);
    const body = await res.json();
    expect(body.data.openViolationCount).toBe(3);
  });

  it("returns 404 when verification not found", async () => {
    vi.mocked(getVerificationById).mockResolvedValue(null);
    const req = new Request("https://jobs.igbo.com/api/v1/admin/verifications/ver-x");
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );
    const req = new Request("https://jobs.igbo.com/api/v1/admin/verifications/ver-1");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});
