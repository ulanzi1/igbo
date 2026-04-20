// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getActivePostingUrlsForSitemap: vi.fn(),
}));

const mockRedis = {
  get: vi.fn(),
  set: vi.fn().mockReturnValue(Promise.resolve("OK")),
  del: vi.fn().mockReturnValue(Promise.resolve(1)),
};
vi.mock("@/lib/redis", () => ({
  getRedisClient: () => mockRedis,
}));
vi.mock("@igbo/config/redis", () => ({
  createRedisKey: (...parts: string[]) => parts.join(":"),
}));

import { getActivePostingUrlsForSitemap } from "@igbo/db/queries/portal-job-postings";
import sitemap from "./sitemap";

const PORTAL_URL = "https://jobs.igbo.com";

beforeEach(() => {
  vi.clearAllMocks();
  mockRedis.get.mockResolvedValue(null); // cache miss by default
  mockRedis.set.mockResolvedValue("OK");
  process.env.NEXT_PUBLIC_PORTAL_URL = PORTAL_URL;
});

describe("sitemap()", () => {
  it("includes static pages with correct priorities", async () => {
    vi.mocked(getActivePostingUrlsForSitemap).mockResolvedValue([]);

    const result = await sitemap();

    const staticHome = result.find((e) => e.url === `${PORTAL_URL}/en/jobs`);
    const staticSearch = result.find((e) => e.url === `${PORTAL_URL}/en/search`);

    expect(staticHome).toBeDefined();
    expect(staticHome?.priority).toBe(0.6);
    expect(staticSearch).toBeDefined();
    expect(staticSearch?.priority).toBe(0.5);
  });

  it("includes active job posting URLs with priority 0.8", async () => {
    const updatedAt = new Date("2026-04-10T10:00:00Z");
    vi.mocked(getActivePostingUrlsForSitemap).mockResolvedValue([
      { id: "job-1", updatedAt },
      { id: "job-2", updatedAt: new Date("2026-04-09") },
    ]);

    const result = await sitemap();

    const job1 = result.find((e) => e.url === `${PORTAL_URL}/en/jobs/job-1`);
    expect(job1).toBeDefined();
    expect(job1?.priority).toBe(0.8);
    // Normalized to ISO string regardless of cache hit/miss.
    expect(job1?.lastModified).toBe("2026-04-10T10:00:00.000Z");
    expect(job1?.changeFrequency).toBe("daily");
  });

  it("returns only static pages when no active postings", async () => {
    vi.mocked(getActivePostingUrlsForSitemap).mockResolvedValue([]);

    const result = await sitemap();

    const jobEntries = result.filter((e) => e.url.includes("/en/jobs/"));
    expect(jobEntries).toHaveLength(0);
    expect(result).toHaveLength(2); // only the 2 static pages
  });

  it("constructs absolute URLs using NEXT_PUBLIC_PORTAL_URL", async () => {
    vi.mocked(getActivePostingUrlsForSitemap).mockResolvedValue([
      { id: "abc-123", updatedAt: new Date() },
    ]);

    const result = await sitemap();
    const jobEntry = result.find((e) => e.url.includes("abc-123"));
    expect(jobEntry?.url).toBe(`${PORTAL_URL}/en/jobs/abc-123`);
  });

  it("falls back to NEXT_PUBLIC_APP_URL when NEXT_PUBLIC_PORTAL_URL is not set", async () => {
    delete process.env.NEXT_PUBLIC_PORTAL_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.igbo.com";
    vi.mocked(getActivePostingUrlsForSitemap).mockResolvedValue([]);

    const result = await sitemap();
    const home = result.find((e) => e.url.includes("/en/jobs"));
    expect(home?.url).toContain("https://app.igbo.com");

    // Restore
    process.env.NEXT_PUBLIC_PORTAL_URL = PORTAL_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("returns cached result when Redis cache hits", async () => {
    const cachedData = [{ id: "cached-job", updatedAt: "2026-04-10T10:00:00.000Z" }];
    mockRedis.get.mockResolvedValue(JSON.stringify(cachedData));

    const result = await sitemap();

    // DB should NOT be called on cache hit
    expect(getActivePostingUrlsForSitemap).not.toHaveBeenCalled();
    const cachedEntry = result.find((e) => e.url.includes("cached-job"));
    expect(cachedEntry).toBeDefined();
    // cachedFetch returns JSON-parsed data — dates are ISO strings
    expect(cachedEntry?.lastModified).toBe("2026-04-10T10:00:00.000Z");
  });

  it("falls back to DB query on cache miss and populates cache via cachedFetch (NX)", async () => {
    mockRedis.get.mockResolvedValue(null);
    const updatedAt = new Date("2026-04-12");
    vi.mocked(getActivePostingUrlsForSitemap).mockResolvedValue([{ id: "db-job", updatedAt }]);

    const result = await sitemap();

    expect(getActivePostingUrlsForSitemap).toHaveBeenCalledTimes(1);
    expect(result.find((e) => e.url.includes("db-job"))).toBeDefined();
    // cachedFetch writes with NX to prevent concurrent stomp
    await vi.waitFor(() => expect(mockRedis.set).toHaveBeenCalledOnce());
    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining("sitemap"),
      expect.any(String),
      "EX",
      3600,
      "NX",
    );
  });

  it("falls back gracefully when DB query fails", async () => {
    mockRedis.get.mockResolvedValue(null);
    vi.mocked(getActivePostingUrlsForSitemap).mockRejectedValue(new Error("DB error"));

    // Should not throw — returns just the static pages
    const result = await sitemap();
    const jobEntries = result.filter((e) => e.url.includes("/en/jobs/"));
    expect(jobEntries).toHaveLength(0);
    expect(result.length).toBeGreaterThanOrEqual(2); // at least static pages
  });

  it("evicts corrupted cache entry and falls back to DB", async () => {
    mockRedis.get.mockResolvedValue("invalid-json{{{");
    vi.mocked(getActivePostingUrlsForSitemap).mockResolvedValue([
      { id: "fresh-job", updatedAt: new Date() },
    ]);

    const result = await sitemap();

    // DB should be called after corrupt cache eviction
    expect(getActivePostingUrlsForSitemap).toHaveBeenCalledTimes(1);
    expect(mockRedis.del).toHaveBeenCalled();
    expect(result.find((e) => e.url.includes("fresh-job"))).toBeDefined();
  });
});
