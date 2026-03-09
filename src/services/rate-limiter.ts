import "server-only";
import { checkRateLimit, buildRateLimitHeaders } from "@/lib/rate-limiter";
import type { RateLimitResult } from "@/lib/rate-limiter";

/**
 * All rate-limit presets. Use with `withApiHandler({ rateLimit: { ...RATE_LIMIT_PRESETS.KEY } })`.
 *
 * Available preset names:
 *   Auth:              LOGIN, REGISTER, FORGOT_PASSWORD, RESEND_VERIFY, EMAIL_OTP, MFA_VERIFY
 *   User self-service: PROFILE_UPDATE, LANGUAGE_UPDATE, GDPR_EXPORT
 *   General:           API_GENERAL
 *   Files:             FILE_UPLOAD_PRESIGN
 *   Notifications:     NOTIFICATION_FETCH
 *   Chat:              CONVERSATION_LIST, CONVERSATION_CREATE, MESSAGE_FETCH, CONVERSATION_READ,
 *                      CONVERSATION_MARK_READ, CONVERSATION_MEMBER_MANAGE, MESSAGE_REACTION,
 *                      MESSAGE_EDIT, MESSAGE_DELETE, MESSAGE_SEARCH, BLOCK_MUTE,
 *                      CONVERSATION_PREFERENCE, DND_TOGGLE
 *   Members:           MEMBER_SEARCH, MEMBER_SUGGESTIONS, SUGGESTION_DISMISS,
 *                      MEMBER_FOLLOW, FOLLOW_LIST, FOLLOW_STATUS_BATCH
 *   Feed/Posts:        FEED_READ, POST_CREATE, POST_COMMENTS_READ, POST_COMMENT_DELETE,
 *                      POST_REACTIONS_READ, POST_REACT, POST_COMMENT, POST_SHARE,
 *                      POST_BOOKMARK, BOOKMARK_LIST, PIN_POST
 *   Groups:            GROUP_CREATE, GROUP_UPDATE, GROUP_LIST, GROUP_DETAIL, GROUP_JOIN,
 *                      GROUP_REQUEST, GROUP_APPROVE_REJECT, GROUP_LEAVE, GROUP_CHANNEL, GROUP_MANAGE
 *   Events:            EVENT_CREATE, EVENT_UPDATE, EVENT_LIST, EVENT_DETAIL, EVENT_RSVP
 *   Search:            GLOBAL_SEARCH
 *   Tier quotas:       TIER_BASIC, TIER_PROFESSIONAL, TIER_TOP_TIER
 *
 * ⚠️  `BROWSE` does NOT exist. Story specs must not reference it.
 * For public GET routes (unauthenticated), omit the `rateLimit` option entirely from `withApiHandler`.
 */
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
  // Story 4.2 additions
  POST_CREATE: { maxRequests: 5, windowMs: 60_000 }, // 5 per minute per userId (abuse guard)
  // Story 4.3 additions
  // Used by REST API routes (Tasks 8.1–8.3):
  POST_COMMENTS_READ: { maxRequests: 120, windowMs: 60_000 }, // 120/min per userId
  POST_COMMENT_DELETE: { maxRequests: 10, windowMs: 60_000 }, // 10/min per userId
  POST_REACTIONS_READ: { maxRequests: 120, windowMs: 60_000 }, // 120/min per userId
  // Reserved for future REST API routes or manual rate-limit checks in Server Actions:
  POST_REACT: { maxRequests: 60, windowMs: 60_000 }, // 60/min per userId (reaction spam guard)
  POST_COMMENT: { maxRequests: 20, windowMs: 60_000 }, // 20/min per userId (comment spam guard)
  POST_SHARE: { maxRequests: 10, windowMs: 60_000 }, // 10/min per userId
  // Story 4.4 additions
  POST_BOOKMARK: { maxRequests: 30, windowMs: 60_000 }, // 30/min per userId (bookmark spam guard)
  BOOKMARK_LIST: { maxRequests: 60, windowMs: 60_000 }, // 60/min per userId
  PIN_POST: { maxRequests: 10, windowMs: 60_000 }, // 10/min per adminId (admin only)
  // Story 5.1 additions
  GROUP_CREATE: { maxRequests: 5, windowMs: 3_600_000 }, // 5/hour per userId
  GROUP_UPDATE: { maxRequests: 20, windowMs: 60_000 }, // 20/min per userId
  GROUP_LIST: { maxRequests: 60, windowMs: 60_000 }, // 60/min per userId
  GROUP_DETAIL: { maxRequests: 120, windowMs: 60_000 }, // 120/min per userId
  // Story 5.2 additions
  GROUP_JOIN: { maxRequests: 10, windowMs: 60_000 }, // 10/min per userId
  GROUP_REQUEST: { maxRequests: 10, windowMs: 60_000 }, // 10/min per userId
  GROUP_APPROVE_REJECT: { maxRequests: 20, windowMs: 60_000 }, // 20/min per userId
  GROUP_LEAVE: { maxRequests: 10, windowMs: 60_000 }, // 10/min per userId
  // Story 5.3 additions
  GROUP_CHANNEL: { maxRequests: 5, windowMs: 60_000 }, // 5/min per userId (channel create/delete)
  GROUP_MANAGE: { maxRequests: 20, windowMs: 60_000 }, // 20/min per userId (pin, etc.)
  // Story 7.1 additions
  EVENT_CREATE: { maxRequests: 5, windowMs: 3_600_000 }, // 5/hour per userId (event creation is costly)
  EVENT_UPDATE: { maxRequests: 20, windowMs: 60_000 }, // 20/min per userId
  EVENT_LIST: { maxRequests: 60, windowMs: 60_000 }, // 60/min per userId
  EVENT_DETAIL: { maxRequests: 120, windowMs: 60_000 }, // 120/min per userId
  // Story 7.2 additions
  EVENT_RSVP: { maxRequests: 10, windowMs: 60_000 }, // 10/min per userId
  // Story 10.1 additions
  GLOBAL_SEARCH: { maxRequests: 30, windowMs: 60_000 }, // 30/min per userId (matches MESSAGE_SEARCH)
  // Story 11.2 additions
  REPORT_SUBMIT: { maxRequests: 10, windowMs: 3_600_000 }, // 10 reports/hour per userId (abuse guard)
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
