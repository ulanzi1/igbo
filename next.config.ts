import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [
    { url: "/en/~offline", revision: Date.now().toString() },
    { url: "/ig/~offline", revision: Date.now().toString() },
  ],
  cacheOnNavigation: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
});

// Realtime server URL for connect-src (WebSocket + HTTP polling)
const realtimeUrl = process.env.NEXT_PUBLIC_REALTIME_URL ?? "";
// Derive ws:// or wss:// variant for WebSocket connections
const realtimeWsUrl = realtimeUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
// Hetzner S3 endpoint for direct browser uploads (presigned PUT)
const s3Endpoint = process.env.HETZNER_S3_ENDPOINT ?? "";
// Public URL origin for CSP img-src (strip path, keep scheme://host:port)
const s3PublicOrigin = (() => {
  try {
    return new URL(process.env.HETZNER_S3_PUBLIC_URL ?? "").origin;
  } catch {
    return "";
  }
})();

const cspDirectives = [
  "default-src 'self'",
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data:${s3PublicOrigin ? ` ${s3PublicOrigin}` : ""}`,
  `media-src 'self'${s3PublicOrigin ? ` ${s3PublicOrigin}` : ""}`,
  "font-src 'self'",
  `connect-src 'self'${realtimeUrl ? ` ${realtimeUrl} ${realtimeWsUrl}` : ""}${s3Endpoint ? ` ${s3Endpoint}` : ""}${s3PublicOrigin ? ` ${s3PublicOrigin}` : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
];

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: cspDirectives.join("; "),
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

// Derive hostname + port from S3 public URL for next/image remotePatterns
const s3ImagePattern = (() => {
  try {
    const url = new URL(process.env.HETZNER_S3_PUBLIC_URL ?? "");
    return {
      protocol: url.protocol.replace(":", "") as "http" | "https",
      hostname: url.hostname,
      port: url.port || undefined,
    };
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    outputFileTracingIncludes: {
      "/**": ["./src/lib/lua/*.lua"],
    },
  },
  images: {
    remotePatterns: [
      ...(s3ImagePattern
        ? [
            {
              protocol: s3ImagePattern.protocol,
              hostname: s3ImagePattern.hostname,
              port: s3ImagePattern.port ?? "",
            },
          ]
        : []),
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

// Compose: Serwist outermost (webpack config), next-intl inner
export default withSerwist(withNextIntl(nextConfig));
