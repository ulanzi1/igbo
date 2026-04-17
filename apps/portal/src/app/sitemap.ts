import type { MetadataRoute } from "next";
import { getActivePostingUrlsForSitemap } from "@igbo/db/queries/portal-job-postings";
import { createRedisKey } from "@igbo/config/redis";
import { getRedisClient } from "@/lib/redis";

const SITEMAP_CACHE_KEY = createRedisKey("portal", "sitemap", "urls");
const SITEMAP_TTL = 3600; // 1 hour

interface SitemapEntry {
  id: string;
  updatedAt: Date;
}

async function getCachedSitemapUrls(): Promise<SitemapEntry[]> {
  const redis = getRedisClient();
  try {
    const cached = await redis.get(SITEMAP_CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as Array<{ id: string; updatedAt: string }>;
        return parsed.map((e) => ({ id: e.id, updatedAt: new Date(e.updatedAt) }));
      } catch {
        // Corrupted cache — evict and fall through to DB
        redis.del(SITEMAP_CACHE_KEY).catch(() => {});
      }
    }
  } catch {
    // Redis unavailable — fall through to DB
  }

  const urls = await getActivePostingUrlsForSitemap();

  redis.set(SITEMAP_CACHE_KEY, JSON.stringify(urls), "EX", SITEMAP_TTL).catch(() => {});

  return urls;
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
    lastModified: entry.updatedAt,
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
