// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/db/queries/portal-seeker-profiles", () => ({
  getSeekerProfileById: vi.fn(),
  getSeekerProfileByUserId: vi.fn(),
  incrementProfileViewCount: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-applications", () => ({
  getApplicationCountsByStatusForSeeker: vi.fn(),
}));
vi.mock("@igbo/config/redis", () => ({
  createRedisKey: vi.fn((_app: string, domain: string, id: string) => `portal:${domain}:${id}`),
}));

const mockSet = vi.fn();
const mockDel = vi.fn();
vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(() => ({ set: mockSet, del: mockDel })),
}));

import {
  getSeekerProfileById,
  getSeekerProfileByUserId,
  incrementProfileViewCount,
} from "@igbo/db/queries/portal-seeker-profiles";
import { getApplicationCountsByStatusForSeeker } from "@igbo/db/queries/portal-applications";
import { recordSeekerProfileView, getSeekerAnalytics } from "./seeker-analytics-service";
import { seekerProfileFactory } from "@/test/factories";

const SEEKER_PROFILE_ID = "sp-1";
const SEEKER_USER_ID = "seeker-owner";
const VIEWER_USER_ID = "viewer-1";

const mockProfile = seekerProfileFactory({
  id: SEEKER_PROFILE_ID,
  userId: SEEKER_USER_ID,
  headline: "Dev",
  profileViewCount: 7,
  onboardingCompletedAt: new Date("2026-01-01"),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSeekerProfileById).mockResolvedValue(mockProfile);
});

describe("recordSeekerProfileView", () => {
  it("returns true and increments DB count for a unique view", async () => {
    mockSet.mockResolvedValue("OK");
    vi.mocked(incrementProfileViewCount).mockResolvedValue(undefined);

    const result = await recordSeekerProfileView(SEEKER_PROFILE_ID, VIEWER_USER_ID);
    expect(result).toBe(true);
    expect(incrementProfileViewCount).toHaveBeenCalledWith(SEEKER_PROFILE_ID);
    expect(mockSet).toHaveBeenCalledWith(
      `portal:profile-view-dedup:${SEEKER_PROFILE_ID}:${VIEWER_USER_ID}`,
      "1",
      "EX",
      86400,
      "NX",
    );
  });

  it("returns false for duplicate view within 24h window (no DB increment)", async () => {
    mockSet.mockResolvedValue(null); // NX failed — key already exists

    const result = await recordSeekerProfileView(SEEKER_PROFILE_ID, VIEWER_USER_ID);
    expect(result).toBe(false);
    expect(incrementProfileViewCount).not.toHaveBeenCalled();
  });

  it("gracefully degrades on Redis failure — still increments DB, returns true", async () => {
    mockSet.mockRejectedValue(new Error("Redis connection refused"));
    vi.mocked(incrementProfileViewCount).mockResolvedValue(undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await recordSeekerProfileView(SEEKER_PROFILE_ID, VIEWER_USER_ID);
    expect(result).toBe(true);
    expect(incrementProfileViewCount).toHaveBeenCalledWith(SEEKER_PROFILE_ID);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Redis unavailable"));
    warnSpy.mockRestore();
  });

  it("returns false when profile does not exist (service-layer guard)", async () => {
    vi.mocked(getSeekerProfileById).mockResolvedValue(null);

    const result = await recordSeekerProfileView("missing-profile", VIEWER_USER_ID);
    expect(result).toBe(false);
    expect(mockSet).not.toHaveBeenCalled();
    expect(incrementProfileViewCount).not.toHaveBeenCalled();
  });

  it("returns false when viewer is the profile owner (service-layer self-view guard)", async () => {
    const result = await recordSeekerProfileView(SEEKER_PROFILE_ID, SEEKER_USER_ID);
    expect(result).toBe(false);
    expect(mockSet).not.toHaveBeenCalled();
    expect(incrementProfileViewCount).not.toHaveBeenCalled();
  });

  it("rolls back the Redis dedup key when the DB increment fails", async () => {
    mockSet.mockResolvedValue("OK");
    mockDel.mockResolvedValue(1);
    vi.mocked(incrementProfileViewCount).mockRejectedValue(new Error("db down"));

    await expect(recordSeekerProfileView(SEEKER_PROFILE_ID, VIEWER_USER_ID)).rejects.toThrow(
      "db down",
    );
    expect(mockDel).toHaveBeenCalledWith(
      `portal:profile-view-dedup:${SEEKER_PROFILE_ID}:${VIEWER_USER_ID}`,
    );
  });

  it("does NOT attempt Redis rollback if Redis was unavailable during SET (no key was written)", async () => {
    mockSet.mockRejectedValue(new Error("redis down"));
    vi.mocked(incrementProfileViewCount).mockRejectedValue(new Error("db down"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(recordSeekerProfileView(SEEKER_PROFILE_ID, VIEWER_USER_ID)).rejects.toThrow(
      "db down",
    );
    expect(mockDel).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("tolerates Redis rollback failure and still surfaces the original DB error", async () => {
    mockSet.mockResolvedValue("OK");
    mockDel.mockRejectedValue(new Error("redis del failed"));
    vi.mocked(incrementProfileViewCount).mockRejectedValue(new Error("db down"));

    await expect(recordSeekerProfileView(SEEKER_PROFILE_ID, VIEWER_USER_ID)).rejects.toThrow(
      "db down",
    );
  });
});

describe("getSeekerAnalytics", () => {
  it("correctly groups status counts into display categories", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(getApplicationCountsByStatusForSeeker).mockResolvedValue([
      { status: "submitted", count: 2 },
      { status: "under_review", count: 1 },
      { status: "shortlisted", count: 1 },
      { status: "interview", count: 3 },
      { status: "offered", count: 1 },
      { status: "hired", count: 1 },
      { status: "rejected", count: 2 },
      { status: "withdrawn", count: 4 },
    ]);

    const result = await getSeekerAnalytics("u-1");
    expect(result).not.toBeNull();
    expect(result!.profileViews).toBe(7);
    expect(result!.statusCounts.active).toBe(4); // 2+1+1
    expect(result!.statusCounts.interviews).toBe(3);
    expect(result!.statusCounts.offers).toBe(2); // 1+1
    expect(result!.statusCounts.rejected).toBe(2);
    expect(result!.statusCounts.withdrawn).toBe(4);
    // totalApplications = active + interviews + offers (excludes rejected and withdrawn)
    expect(result!.totalApplications).toBe(9); // 4+3+2
  });

  it("returns zero counts for missing statuses", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue({
      ...mockProfile,
      profileViewCount: 0,
    });
    vi.mocked(getApplicationCountsByStatusForSeeker).mockResolvedValue([]);

    const result = await getSeekerAnalytics("u-1");
    expect(result).not.toBeNull();
    expect(result!.profileViews).toBe(0);
    expect(result!.totalApplications).toBe(0);
    expect(result!.statusCounts).toEqual({
      active: 0,
      interviews: 0,
      offers: 0,
      rejected: 0,
      withdrawn: 0,
    });
  });

  it("returns null when no seeker profile exists", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(null);

    const result = await getSeekerAnalytics("u-nonexistent");
    expect(result).toBeNull();
    expect(getApplicationCountsByStatusForSeeker).not.toHaveBeenCalled();
  });

  it("handles partial status data (only some statuses present)", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(getApplicationCountsByStatusForSeeker).mockResolvedValue([
      { status: "submitted", count: 1 },
      { status: "rejected", count: 2 },
    ]);

    const result = await getSeekerAnalytics("u-1");
    expect(result!.statusCounts.active).toBe(1);
    expect(result!.statusCounts.interviews).toBe(0);
    expect(result!.statusCounts.offers).toBe(0);
    expect(result!.statusCounts.rejected).toBe(2);
    expect(result!.statusCounts.withdrawn).toBe(0);
    expect(result!.totalApplications).toBe(1);
  });
});
