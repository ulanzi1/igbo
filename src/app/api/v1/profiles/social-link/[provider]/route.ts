import { randomUUID, createHash } from "node:crypto";
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getRedisClient } from "@/lib/redis";
import { env } from "@/env";

const ALLOWED_PROVIDERS = ["facebook", "linkedin", "twitter", "instagram"] as const;
type Provider = (typeof ALLOWED_PROVIDERS)[number];

function isValidProvider(p: string): p is Provider {
  return (ALLOWED_PROVIDERS as readonly string[]).includes(p);
}

function isProviderConfigured(provider: Provider): boolean {
  switch (provider) {
    case "facebook":
      return !!(env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET);
    case "linkedin":
      return !!(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET);
    case "twitter":
      return !!(env.X_CLIENT_ID && env.X_CLIENT_SECRET);
    case "instagram":
      return !!(env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET);
  }
}

function generateCodeVerifier(): string {
  const bytes = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  return Buffer.from(bytes).toString("base64url").slice(0, 128);
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function buildAuthorizationUrl(
  provider: Provider,
  state: string,
  redirectUri: string,
  codeChallenge?: string,
): string {
  switch (provider) {
    case "facebook": {
      const params = new URLSearchParams({
        client_id: env.FACEBOOK_APP_ID ?? "",
        redirect_uri: redirectUri,
        state,
        scope: "public_profile",
      });
      return `https://www.facebook.com/v22.0/dialog/oauth?${params.toString()}`;
    }
    case "linkedin": {
      const params = new URLSearchParams({
        response_type: "code",
        client_id: env.LINKEDIN_CLIENT_ID ?? "",
        redirect_uri: redirectUri,
        state,
        scope: "openid profile",
      });
      return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
    }
    case "twitter": {
      const params = new URLSearchParams({
        response_type: "code",
        client_id: env.X_CLIENT_ID ?? "",
        redirect_uri: redirectUri,
        state,
        scope: "users.read",
        code_challenge: codeChallenge ?? "",
        code_challenge_method: "S256",
      });
      return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
    }
    case "instagram": {
      const params = new URLSearchParams({
        client_id: env.INSTAGRAM_APP_ID ?? "",
        redirect_uri: redirectUri,
        state,
        scope: "instagram_basic",
      });
      return `https://www.facebook.com/v22.0/dialog/oauth?${params.toString()}`;
    }
  }
}

export const GET = withApiHandler(async (request: Request) => {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  const provider = pathParts[pathParts.length - 1]?.toLowerCase() ?? "";

  if (!isValidProvider(provider)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid provider" });
  }

  if (!isProviderConfigured(provider)) {
    throw new ApiError({
      title: "Service Unavailable",
      status: 503,
      detail: "Provider temporarily unavailable",
    });
  }

  const { userId } = await requireAuthenticatedSession();

  const state = randomUUID();
  const redis = getRedisClient();
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  const redirectUri = `${appUrl}/api/v1/profiles/social-link/${provider}/callback`;

  const locale = request.headers.get("accept-language")?.split(",")[0]?.split("-")[0] ?? "en";
  await redis.set(
    `social_link_state:${state}`,
    `${userId}:${provider.toUpperCase()}:${locale}`,
    "EX",
    600,
  );

  let codeChallenge: string | undefined;

  if (provider === "twitter") {
    const codeVerifier = generateCodeVerifier();
    codeChallenge = generateCodeChallenge(codeVerifier);
    await redis.set(`social_link_pkce:${state}`, codeVerifier, "EX", 600);
  }

  const authorizationUrl = buildAuthorizationUrl(provider, state, redirectUri, codeChallenge);

  return new Response(null, {
    status: 302,
    headers: { Location: authorizationUrl },
  });
});
