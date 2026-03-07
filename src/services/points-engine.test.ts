// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Capture event handlers at module-load time
const { handlerRef, captureHandler } = vi.hoisted(() => {
  const m = new Map<string, (payload: unknown) => unknown>();
  return {
    handlerRef: { current: m },
    captureHandler: (e: string, h: unknown) => m.set(e, h as (p: unknown) => unknown),
  };
});

const mockAwardPoints = vi.hoisted(() => vi.fn().mockResolvedValue([1, "ok", 100, 150]));
vi.mock("@/lib/points-lua-runner", () => ({
  awardPoints: (...args: unknown[]) => mockAwardPoints(...args),
}));

const mockInsertLedgerEntry = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockGetPointsRule = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ basePoints: 1, activityType: "like_received", isActive: true }),
);
const mockGetUserPointsTotal = vi.hoisted(() => vi.fn().mockResolvedValue(10));
const mockLogPointsThrottle = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/db/queries/points", () => ({
  insertPointsLedgerEntry: (...args: unknown[]) => mockInsertLedgerEntry(...args),
  getPointsRuleByActivityType: (...args: unknown[]) => mockGetPointsRule(...args),
  getUserPointsTotal: (...args: unknown[]) => mockGetUserPointsTotal(...args),
  logPointsThrottle: (...args: unknown[]) => mockLogPointsThrottle(...args),
}));

const mockGetPostContentLength = vi.hoisted(() => vi.fn().mockResolvedValue(50)); // default: 50 chars (passes gate)
vi.mock("@/db/queries/posts", () => ({
  getPostContentLength: (...args: unknown[]) => mockGetPostContentLength(...args),
  insertPost: vi.fn(),
  getPostGroupId: vi.fn(),
  getPostAuthorId: vi.fn(),
}));

const mockRedisGet = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const mockRedisSet = vi.hoisted(() => vi.fn().mockResolvedValue("OK"));
const mockRedisZrem = vi.hoisted(() => vi.fn().mockResolvedValue(1));
const mockRedisPublish = vi.hoisted(() => vi.fn().mockResolvedValue(1));
vi.mock("@/lib/redis", () => ({
  getRedisClient: () => ({ get: mockRedisGet, set: mockRedisSet, zrem: mockRedisZrem }),
  getRedisPublisher: () => ({ publish: mockRedisPublish }),
}));

const mockCreateNotification = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: "notif-1", createdAt: new Date() }),
);
vi.mock("@/db/queries/notifications", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { on: vi.fn(captureHandler), emit: vi.fn() },
}));

// Side-effect: registers handlers and captures them in handlerRef
import "./points-engine";
import {
  getBadgeMultiplier,
  getUserPointsBalance,
  handlePostReacted,
  handleEventAttended,
  handleArticlePublished,
  handleAccountStatusChanged,
} from "./points-engine";

beforeEach(() => {
  vi.clearAllMocks();
  // Reset defaults
  mockGetPostContentLength.mockResolvedValue(50);
  mockGetPointsRule.mockResolvedValue({
    basePoints: 1,
    activityType: "like_received",
    isActive: true,
  });
  mockAwardPoints.mockResolvedValue([1, "ok", 100, 150]);
  mockRedisGet.mockResolvedValue(null);
  mockGetUserPointsTotal.mockResolvedValue(10);
});

// ─── handlePostReacted ────────────────────────────────────────────────────────

describe("handlePostReacted", () => {
  const basePayload = {
    postId: "post-1",
    userId: "reactor-1",
    reaction: "like",
    authorId: "author-1",
    timestamp: new Date().toISOString(),
  };

  it("1. quality gate — content < 10 chars → awardPoints NOT called", async () => {
    mockGetPostContentLength.mockResolvedValue(5);

    await handlePostReacted(basePayload);

    expect(mockAwardPoints).not.toHaveBeenCalled();
    expect(mockInsertLedgerEntry).not.toHaveBeenCalled();
  });

  it("2. quality gate — content === null (post deleted) → awardPoints NOT called", async () => {
    mockGetPostContentLength.mockResolvedValue(null);

    await handlePostReacted(basePayload);

    expect(mockAwardPoints).not.toHaveBeenCalled();
    expect(mockInsertLedgerEntry).not.toHaveBeenCalled();
  });

  it("3. award success — awardPoints called with correct idempotencyKey including postId + userId", async () => {
    await handlePostReacted(basePayload);

    expect(mockAwardPoints).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "reaction:post-1:reactor-1",
        actorId: "reactor-1",
        earnerUserId: "author-1",
      }),
    );
  });

  it("4. award success — insertPointsLedgerEntry called with sourceType: 'like_received'", async () => {
    await handlePostReacted(basePayload);

    expect(mockInsertLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "author-1",
        sourceType: "like_received",
        sourceId: "post-1",
      }),
    );
  });

  it("5. duplicate block — result[1] === 'duplicate' → NO ledger insert, NO audit log", async () => {
    mockAwardPoints.mockResolvedValue([0, "duplicate", 100, 150]);

    await handlePostReacted(basePayload);

    expect(mockInsertLedgerEntry).not.toHaveBeenCalled();
    expect(mockLogPointsThrottle).not.toHaveBeenCalled();
  });

  it("6. rapid_fire block — logPointsThrottle called with reason: 'rapid_fire'", async () => {
    mockAwardPoints.mockResolvedValue([0, "rapid_fire", 100, 150]);

    await handlePostReacted(basePayload);

    expect(mockLogPointsThrottle).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "rapid_fire", actorId: "reactor-1" }),
    );
  });

  it("7. rapid_fire block — createNotification called for reactor userId", async () => {
    mockAwardPoints.mockResolvedValue([0, "rapid_fire", 100, 150]);

    await handlePostReacted(basePayload);

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "reactor-1",
        type: "system",
        title: "notifications.points_throttled.title",
      }),
    );
  });

  it("8. repeat_pair block — logPointsThrottle called, createNotification NOT called", async () => {
    mockAwardPoints.mockResolvedValue([0, "repeat_pair", 100, 150]);

    await handlePostReacted(basePayload);

    expect(mockLogPointsThrottle).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "repeat_pair" }),
    );
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("9. daily_cap block — neither logThrottle nor notification (silent)", async () => {
    mockAwardPoints.mockResolvedValue([0, "daily_cap", 100, 150]);

    await handlePostReacted(basePayload);

    expect(mockLogPointsThrottle).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockInsertLedgerEntry).not.toHaveBeenCalled();
  });

  it("10a. awardPoints throws (Redis down) → error propagates to handler wrapper", async () => {
    mockAwardPoints.mockRejectedValue(new Error("Redis connection refused"));

    await expect(handlePostReacted(basePayload)).rejects.toThrow("Redis connection refused");
    expect(mockInsertLedgerEntry).not.toHaveBeenCalled();
  });

  it("10. rule not found (returns null) → awardPoints NOT called", async () => {
    mockGetPointsRule.mockResolvedValue(null);

    await handlePostReacted(basePayload);

    expect(mockAwardPoints).not.toHaveBeenCalled();
  });
});

// ─── handleEventAttended ──────────────────────────────────────────────────────

describe("handleEventAttended", () => {
  const payload = {
    eventId: "event-1",
    userId: "attendee-1",
    hostId: "host-1",
    timestamp: new Date().toISOString(),
  };

  beforeEach(() => {
    mockGetPointsRule.mockResolvedValue({
      basePoints: 5,
      activityType: "event_attended",
      isActive: true,
    });
  });

  it("11. actorId = payload.userId, earnerUserId = payload.hostId in awardPoints call", async () => {
    await handleEventAttended(payload);

    expect(mockAwardPoints).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "attendee-1",
        earnerUserId: "host-1",
        idempotencyKey: "attended:event-1:attendee-1",
      }),
    );
  });

  it("12a. rule not found → awardPoints NOT called", async () => {
    mockGetPointsRule.mockResolvedValue(null);

    await handleEventAttended(payload);

    expect(mockAwardPoints).not.toHaveBeenCalled();
    expect(mockInsertLedgerEntry).not.toHaveBeenCalled();
  });

  it("12. award success → insertPointsLedgerEntry with sourceType: 'event_attended', userId: hostId", async () => {
    await handleEventAttended(payload);

    expect(mockInsertLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "host-1",
        sourceType: "event_attended",
        sourceId: "event-1",
      }),
    );
  });
});

// ─── handleArticlePublished ───────────────────────────────────────────────────

describe("handleArticlePublished", () => {
  const payload = {
    articleId: "article-1",
    authorId: "author-1",
    title: "Test Article",
    slug: "test-article",
    timestamp: new Date().toISOString(),
  };

  beforeEach(() => {
    mockGetPointsRule.mockResolvedValue({
      basePoints: 10,
      activityType: "article_published",
      isActive: true,
    });
  });

  it("13. actorId starts with 'article:' in awardPoints call (synthetic)", async () => {
    await handleArticlePublished(payload);

    expect(mockAwardPoints).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "article:article-1",
        idempotencyKey: "article:article-1",
      }),
    );
  });

  it("14a. rule not found → awardPoints NOT called", async () => {
    mockGetPointsRule.mockResolvedValue(null);

    await handleArticlePublished(payload);

    expect(mockAwardPoints).not.toHaveBeenCalled();
    expect(mockInsertLedgerEntry).not.toHaveBeenCalled();
  });

  it("14. award success → insertPointsLedgerEntry with sourceType: 'article_published'", async () => {
    await handleArticlePublished(payload);

    expect(mockInsertLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "author-1",
        sourceType: "article_published",
        sourceId: "article-1",
      }),
    );
  });
});

// ─── handleAccountStatusChanged ───────────────────────────────────────────────

describe("handleAccountStatusChanged", () => {
  it("15. SUSPENDED → zrem called with ('points:leaderboard', userId)", async () => {
    await handleAccountStatusChanged({
      userId: "user-1",
      newStatus: "SUSPENDED",
      timestamp: new Date().toISOString(),
    });

    expect(mockRedisZrem).toHaveBeenCalledWith("points:leaderboard", "user-1");
  });

  it("16. PENDING_DELETION → zrem called", async () => {
    await handleAccountStatusChanged({
      userId: "user-2",
      newStatus: "PENDING_DELETION",
      timestamp: new Date().toISOString(),
    });

    expect(mockRedisZrem).toHaveBeenCalledWith("points:leaderboard", "user-2");
  });

  it("17. ANONYMIZED → zrem called", async () => {
    await handleAccountStatusChanged({
      userId: "user-3",
      newStatus: "ANONYMIZED",
      timestamp: new Date().toISOString(),
    });

    expect(mockRedisZrem).toHaveBeenCalledWith("points:leaderboard", "user-3");
  });

  it("18. active status → zrem NOT called", async () => {
    await handleAccountStatusChanged({
      userId: "user-4",
      newStatus: "ACTIVE",
      timestamp: new Date().toISOString(),
    });

    expect(mockRedisZrem).not.toHaveBeenCalled();
  });
});

// ─── getUserPointsBalance ─────────────────────────────────────────────────────

describe("getUserPointsBalance", () => {
  it("19. Redis hit (non-null) → returns cached value, DB NOT queried", async () => {
    mockRedisGet.mockResolvedValue("75");

    const result = await getUserPointsBalance("user-1");

    expect(result).toBe(75);
    expect(mockGetUserPointsTotal).not.toHaveBeenCalled();
  });

  it("20a. Redis returns corrupted non-numeric string → falls back to DB", async () => {
    mockRedisGet.mockResolvedValue("not-a-number");
    mockGetUserPointsTotal.mockResolvedValue(33);

    const result = await getUserPointsBalance("user-1");

    expect(result).toBe(33);
    expect(mockGetUserPointsTotal).toHaveBeenCalledWith("user-1");
    expect(mockRedisSet).toHaveBeenCalledWith("points:user:user-1", "33");
  });

  it("20. Redis miss (null) → calls getUserPointsTotal + caches via redis.set", async () => {
    mockRedisGet.mockResolvedValue(null);
    mockGetUserPointsTotal.mockResolvedValue(42);

    const result = await getUserPointsBalance("user-1");

    expect(result).toBe(42);
    expect(mockGetUserPointsTotal).toHaveBeenCalledWith("user-1");
    expect(mockRedisSet).toHaveBeenCalledWith("points:user:user-1", "42");
  });
});

// ─── getBadgeMultiplier ───────────────────────────────────────────────────────

describe("getBadgeMultiplier", () => {
  it("21. always returns 1 (Story 8.3 stub)", async () => {
    const result = await getBadgeMultiplier("any-user");

    expect(result).toBe(1);
  });
});
