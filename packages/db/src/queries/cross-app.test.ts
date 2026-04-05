// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../index", () => ({ db: { select: vi.fn() } }));

import { db } from "../index";
import {
  getCommunityVerificationStatus,
  getMembershipDuration,
  getUserEngagementLevel,
  getReferralChain,
} from "./cross-app";

beforeEach(() => {
  vi.clearAllMocks();
});

// Helper to mock db.select().from().where().limit() chain
function makeSelectLimitMock(returnValue: unknown) {
  const limit = vi.fn().mockResolvedValue(returnValue ? [returnValue] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
}

// Helper to mock db.select().from().where() chain (no limit — for aggregate)
function makeSelectWhereMock(returnValue: unknown) {
  const where = vi.fn().mockResolvedValue([returnValue]);
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
}

describe("getCommunityVerificationStatus", () => {
  it("returns isVerified=true with badge type when user has a badge", async () => {
    const badge = { badgeType: "blue", assignedAt: new Date("2025-06-01") };
    makeSelectLimitMock(badge);

    const result = await getCommunityVerificationStatus("u-1");

    expect(result.isVerified).toBe(true);
    expect(result.badgeType).toBe("blue");
    expect(result.verifiedAt).toEqual(badge.assignedAt);
  });

  it("returns isVerified=false when user has no badge", async () => {
    makeSelectLimitMock(undefined);

    const result = await getCommunityVerificationStatus("u-no-badge");

    expect(result.isVerified).toBe(false);
    expect(result.badgeType).toBeNull();
    expect(result.verifiedAt).toBeNull();
  });
});

describe("getMembershipDuration", () => {
  it("calculates durationDays from createdAt", async () => {
    const createdAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    makeSelectLimitMock({ createdAt });

    const result = await getMembershipDuration("u-1");

    expect(result.joinedAt).toEqual(createdAt);
    expect(result.durationDays).toBe(10);
  });

  it("throws when user not found", async () => {
    makeSelectLimitMock(undefined);
    await expect(getMembershipDuration("u-missing")).rejects.toThrow("User not found: u-missing");
  });
});

describe("getUserEngagementLevel", () => {
  function makeEngagementMocks(pointsTotal: string, profileUpdatedAt: Date | null) {
    let callCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Points aggregate query
        const where = vi.fn().mockResolvedValue([{ total: pointsTotal }]);
        const from = vi.fn().mockReturnValue({ where });
        return { from } as unknown as ReturnType<typeof db.select>;
      } else {
        // Community profile query
        const limit = vi
          .fn()
          .mockResolvedValue(profileUpdatedAt ? [{ updatedAt: profileUpdatedAt }] : []);
        const where = vi.fn().mockReturnValue({ limit });
        const from = vi.fn().mockReturnValue({ where });
        return { from } as unknown as ReturnType<typeof db.select>;
      }
    });
  }

  it("returns 'high' level for users with 500+ points", async () => {
    const updatedAt = new Date("2026-01-01");
    makeEngagementMocks("600", updatedAt);
    const result = await getUserEngagementLevel("u-1");
    expect(result.level).toBe("high");
    expect(result.score).toBe(600);
    expect(result.lastActive).toEqual(updatedAt);
  });

  it("returns 'medium' level for users with 100-499 points", async () => {
    makeEngagementMocks("250", null);
    const result = await getUserEngagementLevel("u-2");
    expect(result.level).toBe("medium");
    expect(result.score).toBe(250);
    expect(result.lastActive).toBeNull();
  });

  it("returns 'low' level for users with < 100 points", async () => {
    makeEngagementMocks("50", null);
    const result = await getUserEngagementLevel("u-3");
    expect(result.level).toBe("low");
    expect(result.score).toBe(50);
  });
});

describe("getReferralChain", () => {
  it("returns empty referrals when user has no referralName", async () => {
    makeSelectLimitMock({ id: "u-1", referralName: null });
    const result = await getReferralChain("u-1");
    expect(result.referrals).toHaveLength(0);
  });

  it("returns one referrer when chain depth is 1", async () => {
    let callCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        const limit = vi.fn().mockResolvedValue([{ id: "u-1", referralName: "Alice" }]);
        const where = vi.fn().mockReturnValue({ limit });
        const from = vi.fn().mockReturnValue({ where });
        return { from } as unknown as ReturnType<typeof db.select>;
      } else if (callCount === 2) {
        // Find referrer by name
        const limit = vi.fn().mockResolvedValue([{ id: "u-alice" }]);
        const where = vi.fn().mockReturnValue({ limit });
        const from = vi.fn().mockReturnValue({ where });
        return { from } as unknown as ReturnType<typeof db.select>;
      } else {
        // Next user in chain — no referral
        const limit = vi.fn().mockResolvedValue([{ id: "u-alice", referralName: null }]);
        const where = vi.fn().mockReturnValue({ limit });
        const from = vi.fn().mockReturnValue({ where });
        return { from } as unknown as ReturnType<typeof db.select>;
      }
    });

    const result = await getReferralChain("u-1");
    expect(result.referrals).toHaveLength(1);
    expect(result.referrals[0]).toEqual({ userId: "u-alice", depth: 1 });
  });
});
