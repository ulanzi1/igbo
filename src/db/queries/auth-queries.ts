import "server-only";
import { eq, isNull, and, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { authUsers, authVerificationTokens } from "@/db/schema/auth-users";
import type { NewAuthUser } from "@/db/schema/auth-users";

// ─── User queries ─────────────────────────────────────────────────────────────

export async function findUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(authUsers)
    .where(and(eq(authUsers.email, email), isNull(authUsers.deletedAt)))
    .limit(1);
  return user ?? null;
}

export async function findUserById(id: string) {
  const [user] = await db
    .select()
    .from(authUsers)
    .where(and(eq(authUsers.id, id), isNull(authUsers.deletedAt)))
    .limit(1);
  return user ?? null;
}

export async function createUser(data: NewAuthUser) {
  const [user] = await db.insert(authUsers).values(data).returning();
  return user ?? null;
}

export async function transitionUserToApprovalPending(userId: string) {
  const [updated] = await db
    .update(authUsers)
    .set({
      accountStatus: "PENDING_APPROVAL",
      emailVerified: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(authUsers.id, userId), isNull(authUsers.deletedAt)))
    .returning();
  return updated ?? null;
}

// ─── Verification token queries ────────────────────────────────────────────────

export async function createVerificationToken(data: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}) {
  const [token] = await db.insert(authVerificationTokens).values(data).returning();
  return token ?? null;
}

/**
 * Atomically marks a token as used (SET used_at = NOW()) and returns it.
 * Returns null if not found, already used, or expired.
 */
export async function consumeVerificationToken(tokenHash: string) {
  const now = new Date();
  const [token] = await db
    .update(authVerificationTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(authVerificationTokens.tokenHash, tokenHash),
        isNull(authVerificationTokens.usedAt),
        gt(authVerificationTokens.expiresAt, now),
      ),
    )
    .returning();
  return token ?? null;
}

/**
 * Check if a token exists but is expired or used (for showing resend option).
 */
export async function findTokenByHash(tokenHash: string) {
  const [token] = await db
    .select()
    .from(authVerificationTokens)
    .where(eq(authVerificationTokens.tokenHash, tokenHash))
    .limit(1);
  return token ?? null;
}

/**
 * Delete all existing verification tokens for a user before issuing a new one.
 */
export async function deleteUserVerificationTokens(userId: string) {
  await db.delete(authVerificationTokens).where(eq(authVerificationTokens.userId, userId));
}

/**
 * Count recent verification tokens for rate-limit tracking.
 * Used as a fallback when Redis is unavailable.
 */
export async function countRecentTokensForUser(userId: string, sinceMs: number) {
  const since = new Date(Date.now() - sinceMs);
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(authVerificationTokens)
    .where(
      and(eq(authVerificationTokens.userId, userId), gt(authVerificationTokens.expiresAt, since)),
    );
  return result[0]?.count ?? 0;
}
