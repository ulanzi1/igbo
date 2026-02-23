import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://obigbo.com";
const LOCALES = ["en", "ig"] as const;

const PUBLIC_ROUTES = [
  "",
  "/about",
  "/articles",
  "/events",
  "/blog",
  "/apply",
  "/terms",
  "/privacy",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const route of PUBLIC_ROUTES) {
    for (const locale of LOCALES) {
      const alternateLanguages: Record<string, string> = {};
      for (const altLocale of LOCALES) {
        alternateLanguages[altLocale] = `${BASE_URL}/${altLocale}${route}`;
      }

      entries.push({
        url: `${BASE_URL}/${locale}${route}`,
        changeFrequency: route === "" ? "daily" : "weekly",
        priority: route === "" ? 1.0 : 0.8,
        alternates: {
          languages: alternateLanguages,
        },
      });
    }
  }

  return entries;
}
