// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@igbo/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@igbo/db/schema/portal-admin-reviews", () => ({
  portalAdminReviews: { id: "par_id", postingId: "par_posting_id", decision: "par_decision" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
}));

vi.mock("@/services/admin-review-service", () => ({
  checkFastLaneEligibility: vi.fn(),
}));

import { db } from "@igbo/db";
import { checkFastLaneEligibility } from "@/services/admin-review-service";
import { assertApprovalIntegrity } from "./approval-integrity";

function mockSelectReturning(rows: unknown[]) {
  vi.mocked(db.select).mockImplementation(
    () =>
      ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(rows),
      }) as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assertApprovalIntegrity", () => {
  it("resolves silently when an approved review row exists", async () => {
    mockSelectReturning([{ id: "review-1" }]);

    await expect(assertApprovalIntegrity("posting-1")).resolves.toBeUndefined();
    // Fast-lane should NOT be consulted when an approval row already exists.
    expect(checkFastLaneEligibility).not.toHaveBeenCalled();
  });

  it("resolves silently when no review row exists but fast-lane is eligible", async () => {
    mockSelectReturning([]);
    vi.mocked(checkFastLaneEligibility).mockResolvedValue({ eligible: true, reasons: [] });

    await expect(assertApprovalIntegrity("posting-1")).resolves.toBeUndefined();
    expect(checkFastLaneEligibility).toHaveBeenCalledWith("posting-1");
  });

  it("throws 403 APPROVAL_INTEGRITY_VIOLATION when neither approved nor fast-lane eligible", async () => {
    mockSelectReturning([]);
    vi.mocked(checkFastLaneEligibility).mockResolvedValue({
      eligible: false,
      reasons: ["Employer is not verified"],
    });

    await expect(assertApprovalIntegrity("posting-1")).rejects.toMatchObject({
      status: 403,
      extensions: { code: "PORTAL_ERRORS.APPROVAL_INTEGRITY_VIOLATION" },
    });
  });
});
