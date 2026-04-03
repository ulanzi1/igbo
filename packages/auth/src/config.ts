import "server-only";
import "./types"; // Apply NextAuth module augmentations
import { randomUUID } from "node:crypto";
import type { PortalRole } from "./portal-role";
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@igbo/db";
import { authUsers } from "@igbo/db/schema/auth-users";
import { authSessions } from "@igbo/db/schema/auth-sessions";
import { communityProfiles } from "@igbo/db/schema/community-profiles";
import { findSessionByToken, deleteSessionByToken } from "@igbo/db/queries/auth-sessions";
import { getAuthRedis } from "./redis";
import { cacheSession, getCachedSession, evictCachedSession } from "./session-cache";
import type { Adapter, AdapterSession, AdapterUser } from "next-auth/adapters";

// ─── Challenge token helpers ──────────────────────────────────────────────────

export interface ChallengeData {
  userId: string;
  mfaVerified: boolean;
  requiresMfaSetup: boolean;
  deviceName: string | null;
  deviceIp: string | null;
}

export const CHALLENGE_TTL = 300; // 5 minutes

export async function getChallenge(token: string): Promise<ChallengeData | null> {
  try {
    const redis = getAuthRedis();
    const raw = await redis.get(`challenge:${token}`);
    return raw ? (JSON.parse(raw) as ChallengeData) : null;
  } catch {
    return null;
  }
}

/** Atomically get and delete a challenge token (single-use consumption) */
export async function consumeChallenge(token: string): Promise<ChallengeData | null> {
  try {
    const redis = getAuthRedis();
    const raw = await redis.getdel(`challenge:${token}`);
    return raw ? (JSON.parse(raw) as ChallengeData) : null;
  } catch {
    return null;
  }
}

export async function setChallenge(token: string, data: ChallengeData): Promise<void> {
  const redis = getAuthRedis();
  await redis.set(`challenge:${token}`, JSON.stringify(data), "EX", CHALLENGE_TTL);
}

export async function deleteChallenge(token: string): Promise<void> {
  try {
    const redis = getAuthRedis();
    await redis.del(`challenge:${token}`);
  } catch {
    // Non-critical
  }
}

// ─── Custom adapter wrapper ───────────────────────────────────────────────────

function getSessionTtl(): number {
  return parseInt(process.env.SESSION_TTL_SECONDS ?? "86400", 10);
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET environment variable is required");
  return secret;
}

function buildAdapter(): Adapter {
  const base = DrizzleAdapter(db, {
    usersTable: authUsers,
    // @ts-expect-error -- extended schema with additional columns; sessionToken is unique, not PK
    sessionsTable: authSessions,
  });

  // @ts-expect-error -- @auth/drizzle-adapter bundles a nested @auth/core version that differs
  // from the project's top-level @auth/core, causing AdapterUser type mismatch.
  return {
    ...base,

    async createSession(data: { sessionToken: string; userId: string; expires: Date }) {
      // Retrieve device info stored by login flow via pending_session_device:{userId}
      let deviceName: string | null = null;
      let deviceIp: string | null = null;
      try {
        const redis = getAuthRedis();
        const deviceInfoRaw = await redis.get(`pending_session_device:${data.userId}`);
        if (deviceInfoRaw) {
          const parsed = JSON.parse(deviceInfoRaw) as { deviceName?: string; deviceIp?: string };
          deviceName = parsed.deviceName ?? null;
          deviceIp = parsed.deviceIp ?? null;
          await redis.del(`pending_session_device:${data.userId}`);
        }
      } catch {
        // Non-critical — session creates without device info
      }

      const [session] = await db
        .insert(authSessions)
        .values({
          id: randomUUID(),
          sessionToken: data.sessionToken,
          userId: data.userId,
          expires: data.expires,
          deviceName,
          deviceIp,
        })
        .returning();

      if (!session) throw new Error("Failed to create session");

      await cacheSession(session, getSessionTtl());

      return session as unknown as AdapterSession;
    },

    async getSessionAndUser(sessionToken: string) {
      // Check Redis first — if cached, skip DB lookup for session existence
      const cached = await getCachedSession(sessionToken);
      if (!cached || cached.expires <= new Date()) {
        // Evict stale cache entry if expired
        if (cached) await evictCachedSession(sessionToken);
      }

      // Always delegate to base adapter for the joined session+user result
      const result = await (
        base.getSessionAndUser as (
          token: string,
        ) => Promise<{ session: AdapterSession; user: AdapterUser } | null>
      )(sessionToken);

      // Populate cache on miss
      if (result && !cached) {
        const dbSession = await findSessionByToken(sessionToken);
        if (dbSession) await cacheSession(dbSession, getSessionTtl());
      }

      return result;
    },

    async deleteSession(sessionToken: string) {
      await evictCachedSession(sessionToken);
      await deleteSessionByToken(sessionToken);
    },
  };
}

// ─── NextAuth configuration ───────────────────────────────────────────────────

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: buildAdapter(),
  session: {
    strategy: "jwt",
    maxAge: getSessionTtl(),
    updateAge: 86400,
  },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      options: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        path: "/",
        domain: process.env.COOKIE_DOMAIN || undefined,
      },
    },
  },
  providers: [
    Credentials({
      credentials: {
        challengeToken: { type: "text" },
      },
      async authorize(credentials) {
        const challengeToken = credentials.challengeToken as string | undefined;
        if (!challengeToken) return null;

        // Atomic get-and-delete: single-use challenge token
        const challenge = await consumeChallenge(challengeToken);
        if (!challenge || !challenge.mfaVerified) return null;

        // Load the user
        const [user] = await db
          .select()
          .from(authUsers)
          .where(eq(authUsers.id, challenge.userId))
          .limit(1);

        if (!user || user.accountStatus !== "APPROVED") return null;

        // Check if the user has completed their profile (single indexed lookup, only at login)
        const [profile] = await db
          .select({
            profileCompletedAt: communityProfiles.profileCompletedAt,
            photoUrl: communityProfiles.photoUrl,
          })
          .from(communityProfiles)
          .where(eq(communityProfiles.userId, user.id))
          .limit(1);
        const profileCompleted = !!profile?.profileCompletedAt;

        // Store device info for createSession to pick up (short TTL: 30s)
        try {
          const redis = getAuthRedis();
          await redis.set(
            `pending_session_device:${user.id}`,
            JSON.stringify({ deviceName: challenge.deviceName, deviceIp: challenge.deviceIp }),
            "EX",
            30,
          );
        } catch {
          // Non-critical
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          image: profile?.photoUrl ?? null,
          role: user.role,
          accountStatus: user.accountStatus,
          profileCompleted,
          membershipTier: user.membershipTier,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.role = (
          user as {
            role: "MEMBER" | "ADMIN" | "MODERATOR" | "JOB_SEEKER" | "EMPLOYER" | "JOB_ADMIN";
          }
        ).role;
        token.accountStatus = (user as { accountStatus: string }).accountStatus;
        token.profileCompleted = (user as { profileCompleted: boolean }).profileCompleted;
        token.membershipTier =
          (user as { membershipTier?: "BASIC" | "PROFESSIONAL" | "TOP_TIER" }).membershipTier ??
          "BASIC";
        token.picture = (user as { image?: string | null }).image ?? null;
        // Populate portal role from RBAC table
        const { getUserPortalRoles } = await import("@igbo/db/queries/auth-permissions");
        const portalRoles = await getUserPortalRoles(user.id as string);
        const PRIORITY: PortalRole[] = ["JOB_SEEKER", "EMPLOYER", "JOB_ADMIN"];
        token.activePortalRole = PRIORITY.find((r) => portalRoles.includes(r)) ?? null;
      }
      // Allow client-side session update to refresh profileCompleted or picture in JWT
      if (trigger === "update") {
        const s = session as { profileCompleted?: boolean; picture?: string | null };
        if (s?.profileCompleted !== undefined) token.profileCompleted = s.profileCompleted;
        if (s?.picture !== undefined) token.picture = s.picture;
      }
      return token;
    },
    async session({ session, token }) {
      // Cast to concrete shape — augmenting next-auth/jwt is done in consuming apps,
      // not in this package (next-auth/jwt re-exports from @auth/core which isn't a
      // direct dep here, so declare module augmentation fails standalone typecheck).
      type AppToken = {
        id: string;
        role: "MEMBER" | "ADMIN" | "MODERATOR" | "JOB_SEEKER" | "EMPLOYER" | "JOB_ADMIN";
        accountStatus: string;
        profileCompleted: boolean;
        membershipTier: "BASIC" | "PROFESSIONAL" | "TOP_TIER" | undefined;
        picture?: string | null;
        activePortalRole?: "JOB_SEEKER" | "EMPLOYER" | "JOB_ADMIN" | null;
      };
      const t = token as unknown as AppToken;
      session.user.id = t.id;
      session.user.role = t.role;
      session.user.accountStatus = t.accountStatus;
      session.user.profileCompleted = t.profileCompleted;
      session.user.membershipTier = t.membershipTier ?? "BASIC";
      session.user.image = t.picture ?? null;
      session.user.activePortalRole = t.activePortalRole ?? null;
      // Create a short-lived JWT for Socket.IO auth (realtime server verifies with same AUTH_SECRET)
      const secret = new TextEncoder().encode(getAuthSecret());
      session.sessionToken = await new SignJWT({ id: t.id })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("1h")
        .sign(secret);
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
