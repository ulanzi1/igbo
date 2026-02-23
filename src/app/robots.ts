import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://obigbo.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/en/", "/ig/"],
        disallow: [
          "/*/dashboard",
          "/*/dashboard/*",
          "/*/chat",
          "/*/chat/*",
          "/*/profile",
          "/*/profile/*",
          "/*/settings",
          "/*/settings/*",
          "/*/admin",
          "/*/admin/*",
          "/*/notifications",
          "/*/notifications/*",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
