// OAuth callback — NOT wrapped with withApiHandler because this is a browser redirect endpoint.
// Errors redirect to settings page rather than returning JSON.
import type { NextRequest } from "next/server";
import { getRedisClient } from "@/lib/redis";
import { env } from "@/env";
import * as profileService from "@/services/profile-service";
import type { SocialProvider } from "@/features/profiles/types";

const ALLOWED_PROVIDERS = ["facebook", "linkedin", "twitter", "instagram"] as const;
type Provider = (typeof ALLOWED_PROVIDERS)[number];

function isValidProvider(p: string): p is Provider {
  return (ALLOWED_PROVIDERS as readonly string[]).includes(p);
}

const PROVIDER_MAP: Record<Provider, SocialProvider> = {
  facebook: "FACEBOOK",
  linkedin: "LINKEDIN",
  twitter: "TWITTER",
  instagram: "INSTAGRAM",
};

function errorRedirect(locale: string, provider: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/${locale}/settings/privacy?error=oauth_failed&provider=${provider}`,
    },
  });
}

async function exchangeToken(
  provider: Provider,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
): Promise<string> {
  switch (provider) {
    case "facebook":
    case "instagram": {
      const appId = provider === "facebook" ? env.FACEBOOK_APP_ID : env.INSTAGRAM_APP_ID;
      const appSecret =
        provider === "facebook" ? env.FACEBOOK_APP_SECRET : env.INSTAGRAM_APP_SECRET;
      const params = new URLSearchParams({
        code,
        client_id: appId ?? "",
        client_secret: appSecret ?? "",
        redirect_uri: redirectUri,
      });
      const res = await fetch("https://graph.facebook.com/v22.0/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      if (!res.ok) throw new Error("Token exchange failed");
      const json = (await res.json()) as { access_token?: string };
      if (!json.access_token) throw new Error("No access token");
      return json.access_token;
    }
    case "linkedin": {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: env.LINKEDIN_CLIENT_ID ?? "",
        client_secret: env.LINKEDIN_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri,
      });
      const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      if (!res.ok) throw new Error("Token exchange failed");
      const json = (await res.json()) as { access_token?: string };
      if (!json.access_token) throw new Error("No access token");
      return json.access_token;
    }
    case "twitter": {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: env.X_CLIENT_ID ?? "",
        client_secret: env.X_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri,
        code_verifier: codeVerifier ?? "",
      });
      const res = await fetch("https://api.twitter.com/2/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      if (!res.ok) throw new Error("Token exchange failed");
      const json = (await res.json()) as { access_token?: string };
      if (!json.access_token) throw new Error("No access token");
      return json.access_token;
    }
  }
}

async function fetchProfileData(
  provider: Provider,
  accessToken: string,
): Promise<{ displayName: string; profileUrl: string }> {
  switch (provider) {
    case "facebook": {
      const res = await fetch(
        `https://graph.facebook.com/v22.0/me?fields=id,name,link&access_token=${accessToken}`,
      );
      if (!res.ok) throw new Error("Profile fetch failed");
      const json = (await res.json()) as { id?: string; name?: string; link?: string };
      const profileUrl = json.link ?? (json.id ? `https://facebook.com/${json.id}` : "");
      return { displayName: json.name ?? "Facebook User", profileUrl };
    }
    case "linkedin": {
      const res = await fetch("https://api.linkedin.com/oidc/v2/userInfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Profile fetch failed");
      const json = (await res.json()) as { sub?: string; name?: string };
      return {
        displayName: json.name ?? "LinkedIn User",
        profileUrl: json.sub ? `https://www.linkedin.com/in/${json.sub}` : "",
      };
    }
    case "twitter": {
      const res = await fetch("https://api.twitter.com/2/users/me?user.fields=username", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Profile fetch failed");
      const json = (await res.json()) as { data?: { username?: string } };
      const username = json.data?.username ?? "";
      return {
        displayName: `@${username}`,
        profileUrl: `https://twitter.com/${username}`,
      };
    }
    case "instagram": {
      const res = await fetch(
        `https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`,
      );
      if (!res.ok) throw new Error("Profile fetch failed");
      const json = (await res.json()) as { username?: string };
      const username = json.username ?? "";
      return {
        displayName: `@${username}`,
        profileUrl: `https://instagram.com/${username}`,
      };
    }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: rawProvider } = await params;
  if (!isValidProvider(rawProvider)) {
    return errorRedirect("en", rawProvider);
  }

  const provider = rawProvider as Provider;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return errorRedirect("en", provider);
  }

  const redis = getRedisClient();

  const stateValue = await redis.get(`social_link_state:${state}`);
  if (!stateValue) {
    return errorRedirect(locale, provider);
  }
  await redis.del(`social_link_state:${state}`);

  const parts = stateValue.split(":");
  const userId = parts[0];
  const storedProvider = parts[1];
  const storedLocale = parts[2] ?? "en";
  if (!userId || storedProvider !== provider.toUpperCase()) {
    return errorRedirect(storedLocale, provider);
  }

  let codeVerifier: string | undefined;
  if (provider === "twitter") {
    const verifier = await redis.get(`social_link_pkce:${state}`);
    await redis.del(`social_link_pkce:${state}`);
    if (!verifier) {
      return errorRedirect(storedLocale, provider);
    }
    codeVerifier = verifier;
  }

  try {
    const appUrl = env.NEXT_PUBLIC_APP_URL;
    const redirectUri = `${appUrl}/api/v1/profiles/social-link/${provider}/callback`;

    const accessToken = await exchangeToken(provider, code, redirectUri, codeVerifier);
    const { displayName, profileUrl } = await fetchProfileData(provider, accessToken);
    // Access token used only in this scope — never persisted

    const socialProvider = PROVIDER_MAP[provider];
    await profileService.linkSocialAccount(userId, socialProvider, displayName, profileUrl);

    return new Response(null, {
      status: 302,
      headers: {
        Location: `/${storedLocale}/settings/privacy?linked=${socialProvider}`,
      },
    });
  } catch {
    return errorRedirect(locale, provider);
  }
}
