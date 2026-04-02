import path from "path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";

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
  // Note: 'unsafe-inline' is required by Next.js for inline hydration scripts.
  // 'strict-dynamic' ensures only scripts loaded by trusted first-party scripts execute,
  // which mitigates most XSS vectors even with 'unsafe-inline' present.
  // Full nonce-based CSP requires Next.js experimental.serverActions nonce support.
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline' 'strict-dynamic' https://*.sentry.io",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data:${s3PublicOrigin ? ` ${s3PublicOrigin}` : ""}`,
  `media-src 'self'${s3PublicOrigin ? ` ${s3PublicOrigin}` : ""}`,
  "font-src 'self'",
  `connect-src 'self'${realtimeUrl ? ` ${realtimeUrl} ${realtimeWsUrl}` : ""}${s3Endpoint ? ` ${s3Endpoint}` : ""}${s3PublicOrigin ? ` ${s3PublicOrigin}` : ""} https://*.ingest.sentry.io`,
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
  // In pnpm workspaces, Next.js file tracing must start from the monorepo root so it
  // can resolve workspace packages (e.g. @igbo/config, @next/env) into the standalone
  // bundle. Without this, the standalone server crashes with "Cannot find module" errors.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@igbo/config"],
  outputFileTracingIncludes: {
    "/**": ["./src/lib/lua/*.lua"],
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

const sentryOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  disableLogger: true,
};

// Compose: Serwist outermost, next-intl inner, Sentry innermost (webpack plugin runs first)
export default withSerwist(withNextIntl(withSentryConfig(nextConfig, sentryOptions)));
