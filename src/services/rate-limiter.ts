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
  MESSAGE_REACTION: { maxRequests: 60, windowMs: 60_000 }, // 60/min per userId (reaction spam prevention)
  MESSAGE_EDIT: { maxRequests: 20, windowMs: 60_000 }, // 20/min per userId
  MESSAGE_DELETE: { maxRequests: 10, windowMs: 60_000 }, // 10/min per userId
  // Story 2.7 additions
  MESSAGE_SEARCH: { maxRequests: 30, windowMs: 60_000 }, // 30/min per userId
  BLOCK_MUTE: { maxRequests: 30, windowMs: 60_000 }, // 30/min per userId
  CONVERSATION_PREFERENCE: { maxRequests: 60, windowMs: 60_000 }, // 60/min per userId
  DND_TOGGLE: { maxRequests: 10, windowMs: 60_000 }, // 10/min per userId
  // Story 3.1 additions
  MEMBER_SEARCH: { maxRequests: 60, windowMs: 60_000 }, // 60/min per userId
  // Story 3.3 additions
  MEMBER_SUGGESTIONS: { maxRequests: 30, windowMs: 60_000 }, // 30/min per userId
  SUGGESTION_DISMISS: { maxRequests: 20, windowMs: 60_000 }, // 20/min per userId
  // Story 3.4 additions
  MEMBER_FOLLOW: { maxRequests: 30, windowMs: 60_000 }, // 30/min per userId
  FOLLOW_LIST: { maxRequests: 60, windowMs: 60_000 }, // 60/min per userId
  // Epic 3 retro AI-5 addition
  FOLLOW_STATUS_BATCH: { maxRequests: 120, windowMs: 60_000 }, // 120/min per userId (replaces N per-card GETs)
  // Story 4.1 additions
  FEED_READ: { maxRequests: 60, windowMs: 60_000 }, // 60/min per userId
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
