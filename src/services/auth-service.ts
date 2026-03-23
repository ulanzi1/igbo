import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { randomUUID } from "node:crypto";
import bcryptjs from "bcryptjs";
import { generateSecret, generateURI, verifySync } from "otplib";
import qrcode from "qrcode";
import { UAParser } from "ua-parser-js";
import { eq, and, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { authUsers } from "@/db/schema/auth-users";
import { authTotpSecrets } from "@/db/schema/auth-mfa";
import { authPasswordResetTokens } from "@/db/schema/auth-password-reset";
import { authSessions } from "@/db/schema/auth-sessions";
import { findUserByEmail, findUserById } from "@/db/queries/auth-queries";
import {
  findActiveSessionsByUserId,
  deleteSessionById,
  deleteOldestSessionForUser,
  deleteAllSessionsForUser,
  countActiveSessionsForUser,
} from "@/db/queries/auth-sessions";
import { evictCachedSession, evictAllUserSessions } from "@/server/auth/redis-session-cache";
import { setChallenge } from "@/server/auth/config";
import { getRedisClient } from "@/lib/redis";
import { checkRateLimit } from "@/lib/rate-limiter";
import { eventBus } from "@/services/event-bus";
import { enqueueEmailJob } from "@/services/email-service";
import { getActiveSuspension } from "@/db/queries/member-discipline";
import { env } from "@/env";
import { ApiError } from "@/lib/api-error";

// ─── Constants ────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_OTP_TTL = 300; // 5 minutes
const EMAIL_OTP_RATE_LIMIT = 3; // per 15 min
const EMAIL_OTP_RATE_WINDOW_MS = 15 * 60 * 1000;
const MFA_VERIFY_RATE_LIMIT = 5; // max attempts per challenge token
const MFA_VERIFY_RATE_WINDOW = 900; // 15 minutes

// Dummy hash for constant-time comparison when user not found (prevents timing attacks)
const DUMMY_HASH = "$2a$12$000000000000000000000uGBYlkXxFNmPWKxR7jxzXqGMdMKzGwHi";

// ─── Password utilities ───────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(password, hash);
}

export function validatePasswordComplexity(password: string): boolean {
  if (password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

// ─── Login & lockout ──────────────────────────────────────────────────────────

export function parseDeviceInfo(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const parser = new UAParser(userAgent);
  const browser = parser.getBrowser();
  const os = parser.getOS();
  const parts = [browser.name, os.name].filter(Boolean);
  return parts.length > 0 ? parts.join(" on ") : "Unknown device";
}

async function checkLockout(email: string, ip: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const lockKey = `lockout:${email}:${ip}`;
    const locked = await redis.get(lockKey);
    return !!locked;
  } catch {
    return false;
  }
}

async function recordFailedAttempt(email: string, ip: string): Promise<number> {
  try {
    const redis = getRedisClient();
    const attemptsKey = `login_attempts:${email}:${ip}`;
    const now = Date.now();
    const windowStart = now - env.ACCOUNT_LOCKOUT_SECONDS * 1000;

    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(attemptsKey, 0, windowStart);
    pipeline.zadd(attemptsKey, now, `${now}-${randomUUID()}`);
    pipeline.zcount(attemptsKey, windowStart, "+inf");
    pipeline.expire(attemptsKey, env.ACCOUNT_LOCKOUT_SECONDS);

    const results = await pipeline.exec();
    if (!results || results[2]?.[0]) {
      // Pipeline error — fail closed (treat as max attempts to trigger lockout)
      return env.ACCOUNT_LOCKOUT_ATTEMPTS;
    }
    return (results[2]?.[1] as number) ?? 1;
  } catch {
    // Redis unavailable — fail closed
    return env.ACCOUNT_LOCKOUT_ATTEMPTS;
  }
}

async function applyLockout(email: string, userId: string, ip: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.set(`lockout:${email}:${ip}`, "1", "EX", env.ACCOUNT_LOCKOUT_SECONDS);
  } catch {
    // Non-critical — lockout will not be applied but credential check still fails
  }

  // Notify account owner
  const user = await findUserByEmail(email);
  if (user) {
    eventBus.emit("member.locked_out", {
      userId,
      deviceIp: ip,
      timestamp: new Date().toISOString(),
    });
    enqueueEmailJob(`account-lockout-${userId}-${Date.now()}`, {
      to: user.email,
      subject: "Your account has been temporarily locked",
      templateId: "account-lockout",
      data: {
        name: user.name ?? user.email,
        ip,
        lockoutMinutes: Math.ceil(env.ACCOUNT_LOCKOUT_SECONDS / 60),
      },
    });
  }
}

async function clearLoginAttempts(email: string, ip: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.del(`login_attempts:${email}:${ip}`);
  } catch {
    // Non-critical
  }
}

export type LoginResult =
  | { status: "requires_2fa"; challengeToken: string }
  | { status: "requires_2fa_setup"; challengeToken: string }
  | { status: "locked"; lockoutSeconds: number }
  | { status: "banned"; reason: string; appealEmail: string; appealWindow: string }
  | { status: "suspended"; until?: string; reason?: string }
  | { status: "invalid" };

export async function initiateLogin(
  email: string,
  password: string,
  userAgent: string | null,
  ip: string,
): Promise<LoginResult> {
  // Check lockout before touching DB
  const isLocked = await checkLockout(email, ip);
  if (isLocked) {
    return { status: "locked", lockoutSeconds: env.ACCOUNT_LOCKOUT_SECONDS };
  }

  const user = await findUserByEmail(email);

  // Ban check: show specific ban message for banned accounts (still timing-safe)
  if (user?.accountStatus === "BANNED") {
    await bcryptjs.compare(password, DUMMY_HASH); // timing safety
    return {
      status: "banned",
      reason: user.adminNotes ?? "Terms of Service violation",
      appealEmail: "abuse@igbo.global",
      appealWindow: "14 days",
    };
  }

  // Suspension check: verify password first — only reveal suspension after valid credentials.
  // passwordHash guard needed (unlike banned which uses DUMMY_HASH) because we verify real credentials.
  // If passwordHash is null, falls through to generic "not APPROVED" check with timing-safe dummy compare.
  if (user?.accountStatus === "SUSPENDED" && user.passwordHash) {
    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      await recordFailedAttempt(email, ip);
      return { status: "invalid" };
    }
    await clearLoginAttempts(email, ip);
    const suspension = await getActiveSuspension(user.id);
    return {
      status: "suspended",
      until: suspension?.suspensionEndsAt?.toISOString(),
      reason: suspension?.reason ?? undefined,
    };
  }

  // Uniform error — no enumeration; always perform bcrypt compare to prevent timing attacks
  if (!user || user.accountStatus !== "APPROVED" || !user.passwordHash) {
    // Dummy bcrypt compare to equalize timing with valid-user path
    await bcryptjs.compare(password, DUMMY_HASH);
    await recordFailedAttempt(email, ip);
    return { status: "invalid" };
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    const attempts = await recordFailedAttempt(email, ip);
    if (attempts >= env.ACCOUNT_LOCKOUT_ATTEMPTS) {
      await applyLockout(email, user.id, ip);
    }
    return { status: "invalid" };
  }

  // Valid password — clear failed attempts
  await clearLoginAttempts(email, ip);

  // Check if 2FA is set up
  const [totpRecord] = await db
    .select()
    .from(authTotpSecrets)
    .where(and(eq(authTotpSecrets.userId, user.id)))
    .limit(1);

  const deviceName = parseDeviceInfo(userAgent);
  const challengeToken = randomUUID();

  await setChallenge(challengeToken, {
    userId: user.id,
    mfaVerified: false,
    requiresMfaSetup: !totpRecord?.verifiedAt,
    deviceName,
    deviceIp: ip,
  });

  if (!totpRecord?.verifiedAt) {
    return { status: "requires_2fa_setup", challengeToken };
  }

  return { status: "requires_2fa", challengeToken };
}

// ─── 2FA Setup ────────────────────────────────────────────────────────────────

export async function generate2faSecret(userId: string, email: string) {
  const secret = generateSecret();
  const otpauthUri = generateURI({ secret, label: email, issuer: "OBIGBO" });
  const qrCodeDataUrl = await qrcode.toDataURL(otpauthUri);
  return { secret, otpauthUri, qrCodeDataUrl };
}

export async function verify2faAndComplete(
  userId: string,
  secret: string,
  code: string,
  challengeToken: string,
): Promise<{ recoveryCodes: string[] }> {
  const isValid = verifySync({ token: code, secret });
  if (!isValid) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid 2FA code" });
  }

  // Generate 10 recovery codes
  const plainCodes = Array.from({ length: 10 }, () =>
    randomBytes(10).toString("hex").toUpperCase().slice(0, 16),
  );
  const hashedCodes = await Promise.all(plainCodes.map((c) => bcryptjs.hash(c, BCRYPT_ROUNDS)));

  // Upsert TOTP secret
  await db
    .insert(authTotpSecrets)
    .values({
      userId,
      secret,
      recoveryCodes: hashedCodes,
      verifiedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: authTotpSecrets.userId,
      set: { secret, recoveryCodes: hashedCodes, verifiedAt: new Date() },
    });

  // Mark challenge as mfa-verified so signIn can create session
  const { getChallenge, setChallenge: sc } = await import("@/server/auth/config");
  const challenge = await getChallenge(challengeToken);
  if (challenge) {
    await sc(challengeToken, { ...challenge, mfaVerified: true, requiresMfaSetup: false });
  }

  eventBus.emit("member.2fa_setup", {
    userId,
    timestamp: new Date().toISOString(),
  });

  return { recoveryCodes: plainCodes };
}

// ─── 2FA Verification (existing setup) ───────────────────────────────────────

export type Verify2faResult = { status: "ok"; challengeToken: string } | { status: "invalid" };

async function check2faRateLimit(challengeToken: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const key = `mfa_attempts:${challengeToken}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, MFA_VERIFY_RATE_WINDOW);
    return count <= MFA_VERIFY_RATE_LIMIT;
  } catch {
    // Redis unavailable — fail closed
    return false;
  }
}

export async function verify2fa(challengeToken: string, code: string): Promise<Verify2faResult> {
  // Rate limit 2FA verification attempts per challenge token
  const allowed = await check2faRateLimit(challengeToken);
  if (!allowed) return { status: "invalid" };

  const { getChallenge, setChallenge: sc } = await import("@/server/auth/config");
  const challenge = await getChallenge(challengeToken);

  if (!challenge || challenge.mfaVerified) return { status: "invalid" };

  const [totpRecord] = await db
    .select()
    .from(authTotpSecrets)
    .where(and(eq(authTotpSecrets.userId, challenge.userId)))
    .limit(1);

  if (!totpRecord?.verifiedAt) return { status: "invalid" };

  // Try TOTP code
  const isValidTotp = verifySync({ token: code, secret: totpRecord.secret });
  if (isValidTotp) {
    await sc(challengeToken, { ...challenge, mfaVerified: true });
    return { status: "ok", challengeToken };
  }

  // Try recovery codes
  if (totpRecord.recoveryCodes) {
    for (let i = 0; i < totpRecord.recoveryCodes.length; i++) {
      const hash = totpRecord.recoveryCodes[i];
      if (!hash) continue;
      const match = await bcryptjs.compare(code, hash);
      if (match) {
        // Remove used recovery code
        const updatedCodes = totpRecord.recoveryCodes.filter((_, idx) => idx !== i);
        await db
          .update(authTotpSecrets)
          .set({ recoveryCodes: updatedCodes })
          .where(eq(authTotpSecrets.id, totpRecord.id));

        await sc(challengeToken, { ...challenge, mfaVerified: true });
        return { status: "ok", challengeToken };
      }
    }
  }

  return { status: "invalid" };
}

// ─── Email OTP (2FA fallback) ─────────────────────────────────────────────────

export async function sendEmailOtp(userId: string, challengeToken: string): Promise<void> {
  const { getChallenge } = await import("@/server/auth/config");
  const challenge = await getChallenge(challengeToken);
  if (!challenge)
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid challenge" });

  // Rate limit: 3 per 15 min
  const rlResult = await checkRateLimit(
    `email_otp_rl:${userId}`,
    EMAIL_OTP_RATE_LIMIT,
    EMAIL_OTP_RATE_WINDOW_MS,
  );
  if (!rlResult.allowed) {
    throw new ApiError({ title: "Too Many Requests", status: 429, detail: "Rate limit exceeded" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const redis = getRedisClient();
  await redis.set(`email_otp:${userId}`, otp, "EX", EMAIL_OTP_TTL);

  const user = await findUserById(userId);
  if (!user) return;

  enqueueEmailJob(`email-otp-${userId}-${Date.now()}`, {
    to: user.email,
    subject: "Your OBIGBO verification code",
    templateId: "email-otp",
    data: { name: user.name ?? user.email, otp, expiresMinutes: Math.ceil(EMAIL_OTP_TTL / 60) },
  });
}

export async function verifyEmailOtp(
  challengeToken: string,
  userId: string,
  code: string,
): Promise<Verify2faResult> {
  const { getChallenge, setChallenge: sc } = await import("@/server/auth/config");
  const challenge = await getChallenge(challengeToken);
  if (!challenge) return { status: "invalid" };

  const redis = getRedisClient();
  const stored = await redis.get(`email_otp:${userId}`);
  if (!stored || stored !== code) return { status: "invalid" };

  await redis.del(`email_otp:${userId}`);
  await sc(challengeToken, { ...challenge, mfaVerified: true });
  return { status: "ok", challengeToken };
}

// ─── Password reset ───────────────────────────────────────────────────────────

const PASSWORD_SET_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — longer than reset (new account setup)

/**
 * Generates a one-time "set your password" token for a newly approved member.
 * Uses the same authPasswordResetTokens table — the reset-password page handles
 * initial password creation just as well as a reset.
 * Returns the raw token to be embedded in the approval email URL.
 */
export async function generatePasswordSetToken(userId: string): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + PASSWORD_SET_TTL_MS);

  await db.insert(authPasswordResetTokens).values({ userId, tokenHash, expiresAt });

  return rawToken;
}

export async function requestPasswordReset(email: string): Promise<void> {
  // Always return success — prevent enumeration
  const user = await findUserByEmail(email);
  if (!user || user.accountStatus !== "APPROVED") return;

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  await db.insert(authPasswordResetTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  enqueueEmailJob(`password-reset-${user.id}-${Date.now()}`, {
    to: user.email,
    subject: "Reset your OBIGBO password",
    templateId: "password-reset",
    data: {
      name: user.name ?? user.email,
      resetUrl: `${env.NEXT_PUBLIC_APP_URL}/en/reset-password?token=${rawToken}`,
    },
  });
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  if (!validatePasswordComplexity(newPassword)) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Password does not meet complexity requirements",
    });
  }

  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const now = new Date();

  const [tokenRecord] = await db
    .select()
    .from(authPasswordResetTokens)
    .where(
      and(
        eq(authPasswordResetTokens.tokenHash, tokenHash),
        isNull(authPasswordResetTokens.usedAt),
        gt(authPasswordResetTokens.expiresAt, now),
      ),
    )
    .limit(1);

  if (!tokenRecord) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Invalid or expired reset token",
    });
  }

  const passwordHash = await hashPassword(newPassword);

  // Update password, mark token used, and delete sessions atomically
  await db.transaction(async (tx) => {
    await tx
      .update(authUsers)
      .set({ passwordHash, updatedAt: now })
      .where(eq(authUsers.id, tokenRecord.userId));
    await tx
      .update(authPasswordResetTokens)
      .set({ usedAt: now })
      .where(eq(authPasswordResetTokens.id, tokenRecord.id));
    await tx.delete(authSessions).where(eq(authSessions.userId, tokenRecord.userId));
  });

  // Evict all sessions from Redis cache (best-effort, non-transactional)
  const sessions = await findActiveSessionsByUserId(tokenRecord.userId);
  const tokens = sessions.map((s) => s.sessionToken);
  await evictAllUserSessions(tokens);

  const user = await findUserById(tokenRecord.userId);
  if (user) {
    eventBus.emit("member.password_reset", {
      userId: tokenRecord.userId,
      timestamp: new Date().toISOString(),
    });

    enqueueEmailJob(`password-reset-confirm-${user.id}-${Date.now()}`, {
      to: user.email,
      subject: "Your OBIGBO password has been reset",
      templateId: "password-reset-confirmation",
      data: { name: user.name ?? user.email },
    });
  }
}

// ─── Session management ───────────────────────────────────────────────────────

export async function getUserSessions(userId: string) {
  return findActiveSessionsByUserId(userId);
}

export async function revokeSession(sessionId: string, userId: string): Promise<void> {
  const sessions = await findActiveSessionsByUserId(userId);
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Session not found" });
  }

  await evictCachedSession(session.sessionToken);
  await deleteSessionById(sessionId, userId);
}

export async function enforceMaxSessions(userId: string): Promise<string | null> {
  const count = await countActiveSessionsForUser(userId);
  if (count < env.MAX_SESSIONS_PER_USER) return null;

  const oldest = await deleteOldestSessionForUser(userId);
  if (!oldest) return null;

  await evictCachedSession(oldest.sessionToken);

  // Notify the user on the evicted device — best effort
  const user = await findUserById(userId);
  if (user) {
    enqueueEmailJob(`session-evicted-${userId}-${Date.now()}`, {
      to: user.email,
      subject: "You were signed out on another device",
      templateId: "session-evicted",
      data: { name: user.name ?? user.email },
    });
  }

  return oldest.sessionToken;
}

// ─── Admin-assisted 2FA reset ─────────────────────────────────────────────────

export async function admin2faReset(targetUserId: string, adminId: string): Promise<void> {
  // Delete TOTP secrets — user must re-enroll on next login
  await db.delete(authTotpSecrets).where(eq(authTotpSecrets.userId, targetUserId));

  // Invalidate all sessions
  const sessions = await findActiveSessionsByUserId(targetUserId);
  await evictAllUserSessions(sessions.map((s) => s.sessionToken));
  await deleteAllSessionsForUser(targetUserId);

  eventBus.emit("member.2fa_reset", {
    userId: targetUserId,
    resetBy: adminId,
    timestamp: new Date().toISOString(),
  });

  const user = await findUserById(targetUserId);
  if (user) {
    enqueueEmailJob(`2fa-reset-${targetUserId}-${Date.now()}`, {
      to: user.email,
      subject: "Your OBIGBO two-factor authentication has been reset",
      templateId: "2fa-reset-complete",
      data: { name: user.name ?? user.email },
    });
  }
}
