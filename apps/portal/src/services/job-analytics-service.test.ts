// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingWithCompany: vi.fn(),
  incrementViewCount: vi.fn(),
  getJobAnalytics: vi.fn(),
  markSharedToCommunity: vi.fn(),
}));
vi.mock("@igbo/db/queries/posts", () => ({
  insertPost: vi.fn(),
}));
vi.mock("@igbo/config/redis", () => ({
  createRedisKey: vi.fn((ns: string, category: string, key: string) => `${ns}:${category}:${key}`),
}));
vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(),
}));
vi.mock("@/services/event-bus", () => ({
  portalEventBus: { emit: vi.fn() },
}));

import {
  getJobPostingWithCompany,
  incrementViewCount,
  getJobAnalytics,
  markSharedToCommunity,
} from "@igbo/db/queries/portal-job-postings";
import { insertPost } from "@igbo/db/queries/posts";
import { getRedisClient } from "@/lib/redis";
import { portalEventBus } from "@/services/event-bus";
import { trackJobView, getAnalytics, shareJobToCommunity } from "./job-analytics-service";

const mockRedis = { set: vi.fn() };

const mockCompany = {
  id: "cp-1",
  ownerUserId: "user-1",
  name: "Acme Corp",
  logoUrl: null,
  description: null,
  industry: "technology",
  companySize: "11-50",
  cultureInfo: null,
  trustBadge: false,
  onboardingCompletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPosting = {
  id: "jp-1",
  companyId: "cp-1",
  title: "Senior Engineer",
  descriptionHtml: "<p>desc</p>",
  requirements: null,
  salaryMin: null,
  salaryMax: null,
  salaryCompetitiveOnly: false,
  location: "Lagos",
  employmentType: "full_time" as const,
  status: "active" as const,
  culturalContextJson: null,
  descriptionIgboHtml: null,
  applicationDeadline: null,
  expiresAt: null,
  adminFeedbackComment: null,
  closedOutcome: null,
  closedAt: null,
  archivedAt: null,
  viewCount: 10,
  communityPostId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRedisClient).mockReturnValue(
    mockRedis as unknown as ReturnType<typeof getRedisClient>,
  );
  vi.mocked(getJobPostingWithCompany).mockResolvedValue({
    posting: mockPosting,
    company: mockCompany,
  });
  vi.mocked(incrementViewCount).mockResolvedValue(11);
  vi.mocked(getJobAnalytics).mockResolvedValue({
    viewCount: 10,
    applicationCount: 2,
    conversionRate: 20,
    communityPostId: null,
  });
  vi.mocked(markSharedToCommunity).mockResolvedValue({
    ...mockPosting,
    communityPostId: "comm-post-1",
  });
  vi.mocked(insertPost).mockResolvedValue({
    id: "comm-post-1",
    authorId: "user-1",
    content: "content",
    contentType: "text",
    visibility: "members_only",
    category: "announcement",
    groupId: null,
    originalPostId: null,
    status: "active",
    isPinned: false,
    pinnedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Awaited<ReturnType<typeof insertPost>>);
});

// ─── trackJobView ────────────────────────────────────────────────────────────

describe("trackJobView", () => {
  it("returns true on first view (Redis SET returns OK)", async () => {
    mockRedis.set.mockResolvedValue("OK");
    const result = await trackJobView("jp-1", "user-1");
    expect(result).toBe(true);
  });

  it("returns false for duplicate view within 24h (Redis SET returns null)", async () => {
    mockRedis.set.mockResolvedValue(null);
    const result = await trackJobView("jp-1", "user-1");
    expect(result).toBe(false);
  });

  it("calls incrementViewCount only on new view (not duplicate)", async () => {
    mockRedis.set.mockResolvedValue("OK");
    await trackJobView("jp-1", "user-1");
    expect(incrementViewCount).toHaveBeenCalledWith("jp-1");

    vi.clearAllMocks();
    vi.mocked(getRedisClient).mockReturnValue(
      mockRedis as unknown as ReturnType<typeof getRedisClient>,
    );
    mockRedis.set.mockResolvedValue(null);
    await trackJobView("jp-1", "user-1");
    expect(incrementViewCount).not.toHaveBeenCalled();
  });

  it("emits job.viewed event on new view", async () => {
    mockRedis.set.mockResolvedValue("OK");
    await trackJobView("jp-1", "user-1");
    expect(portalEventBus.emit).toHaveBeenCalledWith(
      "job.viewed",
      expect.objectContaining({ jobId: "jp-1", userId: "user-1", isNewView: true }),
    );
  });

  it("does NOT emit job.viewed event on duplicate view", async () => {
    mockRedis.set.mockResolvedValue(null);
    await trackJobView("jp-1", "user-1");
    expect(portalEventBus.emit).not.toHaveBeenCalled();
  });

  it("handles Redis errors gracefully — returns false", async () => {
    mockRedis.set.mockRejectedValue(new Error("Redis connection failed"));
    const result = await trackJobView("jp-1", "user-1");
    expect(result).toBe(false);
    expect(incrementViewCount).not.toHaveBeenCalled();
  });
});

// ─── getAnalytics ────────────────────────────────────────────────────────────

describe("getAnalytics", () => {
  it("returns correct analytics data for owner", async () => {
    const result = await getAnalytics("jp-1", "cp-1");
    expect(result.views).toBe(10);
    expect(result.applications).toBe(2);
    expect(result.conversionRate).toBe(20);
    expect(result.sharedToCommunity).toBe(false);
  });

  it("throws 403 on ownership mismatch", async () => {
    await expect(getAnalytics("jp-1", "cp-wrong")).rejects.toMatchObject({ status: 403 });
  });

  it("throws 404 when posting not found", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue(null);
    await expect(getAnalytics("jp-999", "cp-1")).rejects.toMatchObject({ status: 404 });
  });

  it("handles 0 views without division error (conversionRate = 0)", async () => {
    vi.mocked(getJobAnalytics).mockResolvedValue({
      viewCount: 0,
      applicationCount: 0,
      conversionRate: 0,
      communityPostId: null,
    });
    const result = await getAnalytics("jp-1", "cp-1");
    expect(result.conversionRate).toBe(0);
    expect(Number.isFinite(result.conversionRate)).toBe(true);
  });

  it("sharedToCommunity is true when communityPostId is set", async () => {
    vi.mocked(getJobAnalytics).mockResolvedValue({
      viewCount: 5,
      applicationCount: 1,
      conversionRate: 20,
      communityPostId: "comm-post-1",
    });
    const result = await getAnalytics("jp-1", "cp-1");
    expect(result.sharedToCommunity).toBe(true);
  });
});

// ─── shareJobToCommunity ─────────────────────────────────────────────────────

describe("shareJobToCommunity", () => {
  it("creates community post with correct fields and returns communityPostId", async () => {
    const result = await shareJobToCommunity("jp-1", "cp-1", "user-1");
    expect(result.success).toBe(true);
    expect(result.communityPostId).toBe("comm-post-1");
    expect(insertPost).toHaveBeenCalledWith(
      expect.objectContaining({
        authorId: "user-1",
        contentType: "text",
        category: "announcement",
        visibility: "members_only",
        status: "active",
      }),
    );
  });

  it("sets communityPostId on the job posting", async () => {
    await shareJobToCommunity("jp-1", "cp-1", "user-1");
    expect(markSharedToCommunity).toHaveBeenCalledWith("jp-1", "comm-post-1");
  });

  it("returns already_shared when posting already has communityPostId", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue({
      posting: { ...mockPosting, communityPostId: "existing-post" },
      company: mockCompany,
    });
    const result = await shareJobToCommunity("jp-1", "cp-1", "user-1");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("already_shared");
    expect(insertPost).not.toHaveBeenCalled();
  });

  it("throws 409 for non-active posting", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue({
      posting: { ...mockPosting, status: "paused" as const },
      company: mockCompany,
    });
    await expect(shareJobToCommunity("jp-1", "cp-1", "user-1")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("throws 403 on ownership mismatch", async () => {
    await expect(shareJobToCommunity("jp-1", "cp-wrong", "user-1")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("emits job.shared_to_community event on success", async () => {
    await shareJobToCommunity("jp-1", "cp-1", "user-1");
    expect(portalEventBus.emit).toHaveBeenCalledWith(
      "job.shared_to_community",
      expect.objectContaining({
        jobId: "jp-1",
        companyId: "cp-1",
        communityPostId: "comm-post-1",
        employerUserId: "user-1",
      }),
    );
  });

  it("post content includes job title and company name", async () => {
    await shareJobToCommunity("jp-1", "cp-1", "user-1");
    const call = vi.mocked(insertPost).mock.calls[0];
    expect(call?.[0].content).toContain("Acme Corp is hiring!");
    expect(call?.[0].content).toContain("Senior Engineer");
  });

  it("post content includes portal link with jobId", async () => {
    await shareJobToCommunity("jp-1", "cp-1", "user-1");
    const call = vi.mocked(insertPost).mock.calls[0];
    expect(call?.[0].content).toContain("jp-1");
  });
});
