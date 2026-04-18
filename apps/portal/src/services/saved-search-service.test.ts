// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@igbo/db/queries/portal-saved-searches", () => ({
  getSavedSearchesByUserId: vi.fn(),
  countSavedSearchesByUserId: vi.fn(),
  getSavedSearchById: vi.fn(),
  insertSavedSearch: vi.fn(),
  updateSavedSearch: vi.fn(),
  deleteSavedSearch: vi.fn(),
  getInstantAlertSearches: vi.fn(),
}));

vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingById: vi.fn(),
}));

vi.mock("@igbo/config/redis", () => ({
  createRedisKey: vi.fn((_app: string, ...parts: string[]) => parts.join(":")),
}));

vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(),
}));

vi.mock("@/services/event-bus", () => ({
  portalEventBus: { emit: vi.fn() },
}));

vi.mock("@igbo/config/events", () => ({
  createEventEnvelope: vi.fn(() => ({
    eventId: "evt-1",
    version: 1,
    timestamp: "2026-01-01T00:00:00.000Z",
  })),
}));

import {
  saveSavedSearch,
  getMySearches,
  updateMySearch,
  deleteMySearch,
  evaluateInstantAlert,
  matchesPostingAgainstSearch,
  checkInstantAlerts,
  generateSearchName,
} from "./saved-search-service";
import type { PortalSavedSearch } from "./saved-search-service";
import {
  getSavedSearchesByUserId,
  countSavedSearchesByUserId,
  getSavedSearchById,
  insertSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
  getInstantAlertSearches,
} from "@igbo/db/queries/portal-saved-searches";
import { getJobPostingById } from "@igbo/db/queries/portal-job-postings";
import { getRedisClient } from "@/lib/redis";
import { portalEventBus } from "@/services/event-bus";

const SAVED_SEARCH: PortalSavedSearch = {
  id: "ss-1",
  userId: "u-1",
  name: "Lagos Engineers",
  searchParamsJson: { query: "engineer", filters: { location: ["Lagos"] } },
  alertFrequency: "daily",
  lastAlertedAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const MOCK_REDIS = {
  set: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRedisClient).mockReturnValue(
    MOCK_REDIS as unknown as ReturnType<typeof getRedisClient>,
  );
});

// ─── generateSearchName ───────────────────────────────────────────────────────

describe("generateSearchName", () => {
  it("generates name from query + filters", () => {
    const name = generateSearchName({
      query: "engineer",
      filters: { location: ["Lagos"], employmentType: ["full_time"] },
      sort: "relevance",
      limit: 20,
    });
    expect(name).toContain("engineer");
    expect(name).toContain("Lagos");
    expect(name).toContain("full_time");
  });

  it("generates 'All Jobs' when no params", () => {
    const name = generateSearchName({ sort: "relevance", limit: 20 });
    expect(name).toBe("Search: All Jobs");
  });

  it("truncates to 100 chars", () => {
    const name = generateSearchName({
      query: "a".repeat(200),
      sort: "relevance",
      limit: 20,
    });
    expect(name.length).toBeLessThanOrEqual(100);
  });
});

// ─── saveSavedSearch ──────────────────────────────────────────────────────────

describe("saveSavedSearch", () => {
  it("saves a search successfully", async () => {
    vi.mocked(countSavedSearchesByUserId).mockResolvedValue(0);
    vi.mocked(insertSavedSearch).mockResolvedValue(SAVED_SEARCH);

    const result = await saveSavedSearch("u-1", {
      name: "Lagos Engineers",
      searchParams: { query: "engineer", sort: "relevance", limit: 20 },
      alertFrequency: "daily",
    });

    expect(result).toEqual(SAVED_SEARCH);
    expect(insertSavedSearch).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-1", name: "Lagos Engineers" }),
    );
  });

  it("auto-generates name when not provided", async () => {
    vi.mocked(countSavedSearchesByUserId).mockResolvedValue(0);
    vi.mocked(insertSavedSearch).mockResolvedValue(SAVED_SEARCH);

    await saveSavedSearch("u-1", {
      searchParams: { query: "developer", sort: "relevance", limit: 20 },
      alertFrequency: "daily",
    });

    expect(insertSavedSearch).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.stringContaining("developer") }),
    );
  });

  it("throws 409 when max 10 searches reached", async () => {
    vi.mocked(countSavedSearchesByUserId).mockResolvedValue(10);

    await expect(
      saveSavedSearch("u-1", {
        searchParams: { sort: "relevance", limit: 20 },
        alertFrequency: "daily",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("truncates name to 100 chars", async () => {
    vi.mocked(countSavedSearchesByUserId).mockResolvedValue(0);
    vi.mocked(insertSavedSearch).mockResolvedValue(SAVED_SEARCH);

    await saveSavedSearch("u-1", {
      name: "x".repeat(200),
      searchParams: { sort: "relevance", limit: 20 },
      alertFrequency: "daily",
    });

    const callArg = vi.mocked(insertSavedSearch).mock.calls[0]![0];
    expect(callArg.name.length).toBeLessThanOrEqual(100);
  });
});

// ─── getMySearches ────────────────────────────────────────────────────────────

describe("getMySearches", () => {
  it("returns searches for user", async () => {
    vi.mocked(getSavedSearchesByUserId).mockResolvedValue([SAVED_SEARCH]);
    const result = await getMySearches("u-1");
    expect(result).toEqual([SAVED_SEARCH]);
  });
});

// ─── updateMySearch ───────────────────────────────────────────────────────────

describe("updateMySearch", () => {
  it("updates successfully", async () => {
    const updated = { ...SAVED_SEARCH, name: "New Name" };
    vi.mocked(getSavedSearchById).mockResolvedValue(SAVED_SEARCH);
    vi.mocked(updateSavedSearch).mockResolvedValue(updated);

    const result = await updateMySearch("u-1", "ss-1", { name: "New Name" });
    expect(result).toEqual(updated);
  });

  it("throws 404 when not found", async () => {
    vi.mocked(getSavedSearchById).mockResolvedValue(null);
    await expect(updateMySearch("u-1", "missing", { name: "X" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 403 when owned by another user", async () => {
    vi.mocked(getSavedSearchById).mockResolvedValue({ ...SAVED_SEARCH, userId: "other-user" });
    await expect(updateMySearch("u-1", "ss-1", { name: "X" })).rejects.toMatchObject({
      status: 403,
    });
  });
});

// ─── deleteMySearch ───────────────────────────────────────────────────────────

describe("deleteMySearch", () => {
  it("deletes successfully", async () => {
    vi.mocked(getSavedSearchById).mockResolvedValue(SAVED_SEARCH);
    vi.mocked(deleteSavedSearch).mockResolvedValue(true);

    await expect(deleteMySearch("u-1", "ss-1")).resolves.toBeUndefined();
    expect(deleteSavedSearch).toHaveBeenCalledWith("ss-1");
  });

  it("throws 404 when not found", async () => {
    vi.mocked(getSavedSearchById).mockResolvedValue(null);
    await expect(deleteMySearch("u-1", "missing")).rejects.toMatchObject({ status: 404 });
  });

  it("throws 403 when owned by another user", async () => {
    vi.mocked(getSavedSearchById).mockResolvedValue({ ...SAVED_SEARCH, userId: "other" });
    await expect(deleteMySearch("u-1", "ss-1")).rejects.toMatchObject({ status: 403 });
  });
});

// ─── evaluateInstantAlert ─────────────────────────────────────────────────────

describe("evaluateInstantAlert", () => {
  const posting = { id: "j-1", title: "Engineer" };

  it("returns true when not deduped and not throttled", async () => {
    MOCK_REDIS.set.mockResolvedValue("OK"); // NX succeeded
    MOCK_REDIS.incr.mockResolvedValue(1);
    MOCK_REDIS.expire.mockResolvedValue(1);

    const result = await evaluateInstantAlert(SAVED_SEARCH, posting);
    expect(result).toBe(true);
  });

  it("returns false when already alerted (dedup)", async () => {
    MOCK_REDIS.set.mockResolvedValue(null); // NX failed — already exists

    const result = await evaluateInstantAlert(SAVED_SEARCH, posting);
    expect(result).toBe(false);
  });

  it("returns false when throttled (>5 per day)", async () => {
    MOCK_REDIS.set.mockResolvedValue("OK");
    MOCK_REDIS.incr.mockResolvedValue(6); // 6 > 5
    MOCK_REDIS.expire.mockResolvedValue(1);

    const result = await evaluateInstantAlert(SAVED_SEARCH, posting);
    expect(result).toBe(false);
  });

  it("returns true (fail-open) on Redis error", async () => {
    MOCK_REDIS.set.mockRejectedValue(new Error("Redis down"));

    const result = await evaluateInstantAlert(SAVED_SEARCH, posting);
    expect(result).toBe(true);
  });
});

// ─── matchesPostingAgainstSearch ──────────────────────────────────────────────

describe("matchesPostingAgainstSearch", () => {
  const basePosting = {
    title: "Software Engineer",
    requirements: "React, TypeScript",
    location: "Lagos",
    employmentType: "full_time",
    culturalContextJson: null,
  };

  it("matches when query word appears in title", () => {
    const result = matchesPostingAgainstSearch(basePosting, {
      query: "engineer",
      sort: "relevance",
      limit: 20,
    });
    expect(result).toBe(true);
  });

  it("returns false when query does not match title or requirements", () => {
    const result = matchesPostingAgainstSearch(basePosting, {
      query: "accountant",
      sort: "relevance",
      limit: 20,
    });
    expect(result).toBe(false);
  });

  it("matches when no query (empty = matches all)", () => {
    const result = matchesPostingAgainstSearch(basePosting, {
      sort: "relevance",
      limit: 20,
    });
    expect(result).toBe(true);
  });

  it("returns false when location does not match", () => {
    const result = matchesPostingAgainstSearch(basePosting, {
      filters: { location: ["Abuja"] },
      sort: "relevance",
      limit: 20,
    });
    expect(result).toBe(false);
  });

  it("returns false when employment type does not match", () => {
    const result = matchesPostingAgainstSearch(basePosting, {
      filters: { employmentType: ["part_time"] },
      sort: "relevance",
      limit: 20,
    });
    expect(result).toBe(false);
  });

  it("returns true when employment type matches", () => {
    const result = matchesPostingAgainstSearch(basePosting, {
      filters: { employmentType: ["full_time"] },
      sort: "relevance",
      limit: 20,
    });
    expect(result).toBe(true);
  });

  it("returns false when remote required but posting is not remote", () => {
    const result = matchesPostingAgainstSearch(basePosting, {
      filters: { remote: true },
      sort: "relevance",
      limit: 20,
    });
    expect(result).toBe(false);
  });

  it("returns true when remote required and posting has 'remote' in location", () => {
    const result = matchesPostingAgainstSearch(
      { ...basePosting, location: "Remote / Lagos" },
      { filters: { remote: true }, sort: "relevance", limit: 20 },
    );
    expect(result).toBe(true);
  });
});

// ─── checkInstantAlerts ───────────────────────────────────────────────────────

describe("checkInstantAlerts", () => {
  const POSTING = {
    id: "j-1",
    title: "Software Engineer",
    requirements: "React",
    location: "Lagos",
    employmentType: "full_time",
    culturalContextJson: null,
    companyId: "c-1",
    status: "active",
  };

  const INSTANT_SEARCH = {
    ...SAVED_SEARCH,
    alertFrequency: "instant" as const,
    searchParamsJson: { query: "engineer", sort: "relevance", limit: 20 },
  };

  it("emits event for matching instant search", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue(
      POSTING as Parameters<typeof getJobPostingById>[0] extends string
        ? Awaited<ReturnType<typeof getJobPostingById>>
        : never,
    );
    vi.mocked(getInstantAlertSearches).mockResolvedValue([INSTANT_SEARCH]);

    await checkInstantAlerts("j-1");

    expect(portalEventBus.emit).toHaveBeenCalledWith(
      "saved_search.new_result",
      expect.objectContaining({
        savedSearchId: INSTANT_SEARCH.id,
        userId: INSTANT_SEARCH.userId,
        jobId: "j-1",
        jobTitle: "Software Engineer",
      }),
    );
  });

  it("does not emit when posting not found", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue(null);

    await checkInstantAlerts("j-missing");

    expect(portalEventBus.emit).not.toHaveBeenCalled();
  });

  it("does not emit when no instant searches", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue(
      POSTING as Parameters<typeof getJobPostingById>[0] extends string
        ? Awaited<ReturnType<typeof getJobPostingById>>
        : never,
    );
    vi.mocked(getInstantAlertSearches).mockResolvedValue([]);

    await checkInstantAlerts("j-1");

    expect(portalEventBus.emit).not.toHaveBeenCalled();
  });

  it("does not emit for non-matching search", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue(
      POSTING as Parameters<typeof getJobPostingById>[0] extends string
        ? Awaited<ReturnType<typeof getJobPostingById>>
        : never,
    );
    vi.mocked(getInstantAlertSearches).mockResolvedValue([
      {
        ...INSTANT_SEARCH,
        searchParamsJson: { query: "accountant", sort: "relevance", limit: 20 },
      },
    ]);

    await checkInstantAlerts("j-1");

    expect(portalEventBus.emit).not.toHaveBeenCalled();
  });
});
