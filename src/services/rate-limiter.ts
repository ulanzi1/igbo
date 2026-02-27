import "server-only";
import { checkRateLimit, buildRateLimitHeaders } from "@/lib/rate-limiter";
import type { RateLimitResult } from "@/lib/rate-limiter";

export const RATE_LIMIT_PRESETS = {
  // Auth endpoints — strict limits, IP-based key recommended
  LOGIN: { maxRequests: 10, windowMs: 60_000 }, // 10/min per IP+email
  REGISTER: { maxRequests: 5, windowMs: 60_000 }, // 5/min per IP
  FORGOT_PASSWORD: { maxRequests: 3, windowMs: 3_600_000 }, // 3/hour per email
  RESEND_VERIFY: { maxRequests: 3, windowMs: 3_600_000 }, // 3/hour per email (matches existing)
  EMAIL_OTP: { maxRequests: 3, windowMs: 900_000 }, // 3/15min per userId (matches existing)
  MFA_VERIFY: { maxRequests: 5, windowMs: 900_000 }, // 5/15min per challengeToken (matches existing)
  // User self-service API endpoints
  PROFILE_UPDATE: { maxRequests: 20, windowMs: 60_000 }, // 20/min per userId
  LANGUAGE_UPDATE: { maxRequests: 30, windowMs: 60_000 }, // 30/min per userId
  GDPR_EXPORT: { maxRequests: 1, windowMs: 604_800_000 }, // 1/7days per userId (per Story 1.13 AC)
  // General API
  API_GENERAL: { maxRequests: 100, windowMs: 60_000 }, // 100/min per userId
  // File upload endpoints
  FILE_UPLOAD_PRESIGN: { maxRequests: 20, windowMs: 3_600_000 }, // 20/hour per userId
  // Notification fetch
  NOTIFICATION_FETCH: { maxRequests: 60, windowMs: 60_000 }, // 60/min per userId
  // Chat / Conversation endpoints
  CONVERSATION_LIST: { maxRequests: 60, windowMs: 60_000 }, // 60/min per userId
  CONVERSATION_CREATE: { maxRequests: 10, windowMs: 60_000 }, // 10/min per userId
  MESSAGE_FETCH: { maxRequests: 120, windowMs: 60_000 }, // 120/min per userId
  CONVERSATION_READ: { maxRequests: 120, windowMs: 60_000 }, // 120/min per userId
  CONVERSATION_MARK_READ: { maxRequests: 120, windowMs: 60_000 }, // 120/min per userId
  CONVERSATION_MEMBER_MANAGE: { maxRequests: 20, windowMs: 60_000 }, // 20/min per userId (add/leave group)
  // Tier-based API quotas (per hour)
  TIER_BASIC: { maxRequests: 200, windowMs: 3_600_000 },
  TIER_PROFESSIONAL: { maxRequests: 1000, windowMs: 3_600_000 },
  TIER_TOP_TIER: { maxRequests: 5000, windowMs: 3_600_000 },
} as const satisfies Record<string, { maxRequests: number; windowMs: number }>;

export type RateLimitPreset = (typeof RATE_LIMIT_PRESETS)[keyof typeof RATE_LIMIT_PRESETS];

export async function applyRateLimit(
  key: string,
  preset: RateLimitPreset,
): Promise<RateLimitResult> {
  return checkRateLimit(key, preset.maxRequests, preset.windowMs);
}

export { buildRateLimitHeaders };
export type { RateLimitResult };
