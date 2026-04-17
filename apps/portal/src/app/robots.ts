import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/(gated)/"],
      },
    ],
    sitemap: `${portalUrl}/sitemap.xml`,
  };
}
