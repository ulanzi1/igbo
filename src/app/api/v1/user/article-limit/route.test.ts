// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", role: "MEMBER" }),
}));
vi.mock("@/db/queries/auth-permissions", () => ({
  getUserMembershipTier: vi.fn().mockResolvedValue("PROFESSIONAL"),
}));
vi.mock("@/db/queries/points", () => ({
  getUserPointsTotal: vi.fn().mockResolvedValue(0),
  getEffectiveArticleLimit: vi.fn().mockResolvedValue(1),
}));
vi.mock("@/db/queries/articles", () => ({
  countWeeklyArticleSubmissions: vi.fn().mockResolvedValue(0),
}));

const mockDbSelect = vi.fn();
vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));
vi.mock("@/db/schema/platform-posting-limits", () => ({
  platformPostingLimits: {
    tier: "tier",
    baseLimit: "base_limit",
    pointsThreshold: "points_threshold",
    bonusLimit: "bonus_limit",
  },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  asc: vi.fn((col) => ({ type: "asc", col })),
}));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET } from "./route";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getUserMembershipTier } from "@/db/queries/auth-permissions";
import { getUserPointsTotal, getEffectiveArticleLimit } from "@/db/queries/points";
import { countWeeklyArticleSubmissions } from "@/db/queries/articles";
import { ApiError } from "@/lib/api-error";

const mockRequireAuth = vi.mocked(requireAuthenticatedSession);
const mockGetTier = vi.mocked(getUserMembershipTier);
const mockGetPointsTotal = vi.mocked(getUserPointsTotal);
const mockGetEffectiveLimit = vi.mocked(getEffectiveArticleLimit);
const mockCountWeekly = vi.mocked(countWeeklyArticleSubmissions);

function makeRequest() {
  return new Request("http://localhost/api/v1/user/article-limit");
}

function setupDbSelectWithRows(rows: unknown[]) {
  const mockOrderBy = vi.fn().mockResolvedValue(rows);
  const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  mockDbSelect.mockReturnValue({ from: mockFrom });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER" });
  mockGetTier.mockResolvedValue("PROFESSIONAL");
  mockGetPointsTotal.mockResolvedValue(0);
  mockGetEffectiveLimit.mockResolvedValue(1);
  mockCountWeekly.mockResolvedValue(0);
  setupDbSelectWithRows([
    { tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 500, bonusLimit: 1 },
    { tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 2000, bonusLimit: 2 },
  ]);
});

describe("GET /api/v1/user/article-limit", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("BASIC tier returns effectiveLimit=0 and zeroed weeklyUsed", async () => {
    mockGetTier.mockResolvedValue("BASIC");
    mockGetPointsTotal.mockResolvedValue(100);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.effectiveLimit).toBe(0);
    expect(json.data.weeklyUsed).toBe(0);
    expect(json.data.currentPoints).toBe(100);
    expect(json.data.nextThreshold).toBeNull();
    expect(json.data.nextEffectiveLimit).toBeNull();
  });

  it("Professional at baseline returns limit=1, nextThreshold=500", async () => {
    mockGetPointsTotal.mockResolvedValue(0);
    mockGetEffectiveLimit.mockResolvedValue(1);
    mockCountWeekly.mockResolvedValue(0);
    setupDbSelectWithRows([
      { tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 500, bonusLimit: 1 },
      { tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 2000, bonusLimit: 2 },
    ]);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.effectiveLimit).toBe(1);
    expect(json.data.weeklyUsed).toBe(0);
    expect(json.data.nextThreshold).toBe(500);
    expect(json.data.nextEffectiveLimit).toBe(2); // base 1 + bonus 1
  });

  it("Professional at 2000pts (max) returns nextThreshold=null", async () => {
    mockGetPointsTotal.mockResolvedValue(2000);
    mockGetEffectiveLimit.mockResolvedValue(3);
    mockCountWeekly.mockResolvedValue(1);
    setupDbSelectWithRows([
      // All thresholds are <= currentPoints, so no nextRow found
      { tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 0, bonusLimit: 0 },
      { tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 500, bonusLimit: 1 },
      { tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 2000, bonusLimit: 2 },
    ]);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.data.effectiveLimit).toBe(3);
    expect(json.data.weeklyUsed).toBe(1);
    expect(json.data.nextThreshold).toBeNull();
    expect(json.data.nextEffectiveLimit).toBeNull();
  });

  it("Top-tier shows correct next threshold progression", async () => {
    mockGetTier.mockResolvedValue("TOP_TIER");
    mockGetPointsTotal.mockResolvedValue(1000);
    mockGetEffectiveLimit.mockResolvedValue(3);
    mockCountWeekly.mockResolvedValue(0);
    setupDbSelectWithRows([
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 0, bonusLimit: 0 },
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 1000, bonusLimit: 1 },
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 3000, bonusLimit: 2 },
    ]);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.data.effectiveLimit).toBe(3);
    expect(json.data.nextThreshold).toBe(3000);
    expect(json.data.nextEffectiveLimit).toBe(4); // base 2 + bonus 2
  });

  it("propagates DB error as 500", async () => {
    mockGetEffectiveLimit.mockRejectedValue(new Error("DB down"));

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
