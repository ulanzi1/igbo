import type { MetadataRoute } from "next";
import { getActivePostingUrlsForSitemap } from "@igbo/db/queries/portal-job-postings";
import { createRedisKey } from "@igbo/config/redis";
import { registerCacheNamespace, cachedFetch } from "@/lib/cache-registry";

const SITEMAP_CACHE_KEY = createRedisKey("portal", "sitemap", "urls");
const SITEMAP_TTL = 3600; // 1 hour

// Module-level registration: runs on first import, before any cachedFetch call.
registerCacheNamespace("sitemap", { patterns: ["portal:sitemap:*"] });

interface SitemapEntry {
  id: string;
  updatedAt: string | Date; // string on cache hit (JSON parse), Date on cache miss (raw DB)
}

async function getCachedSitemapUrls(): Promise<SitemapEntry[]> {
  return cachedFetch<SitemapEntry[]>(
    "sitemap",
    SITEMAP_CACHE_KEY,
    SITEMAP_TTL,
    () => getActivePostingUrlsForSitemap() as Promise<SitemapEntry[]>,
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";

  let postingUrls: SitemapEntry[] = [];
  try {
    postingUrls = await getCachedSitemapUrls();
  } catch {
    // Graceful fallback — return only static pages if DB/Redis fails
  }

  const jobEntries: MetadataRoute.Sitemap = postingUrls.map((entry) => ({
    url: `${portalUrl}/en/jobs/${entry.id}`,
    // Normalize: cachedFetch returns Date on miss (raw fetchFn), string on hit (JSON parse).
    lastModified: entry.updatedAt instanceof Date ? entry.updatedAt.toISOString() : entry.updatedAt,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${portalUrl}/en/jobs`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.6,
    },
    {
      url: `${portalUrl}/en/search`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.5,
    },
  ];

  return [...staticPages, ...jobEntries];
}
