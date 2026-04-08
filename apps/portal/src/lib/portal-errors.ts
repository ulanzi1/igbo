export const PORTAL_ERRORS = {
  ROLE_MISMATCH: "PORTAL_ERRORS.ROLE_MISMATCH",
  NOT_FOUND: "PORTAL_ERRORS.NOT_FOUND",
  COMPANY_REQUIRED: "PORTAL_ERRORS.COMPANY_REQUIRED",
  DUPLICATE_COMPANY_PROFILE: "PORTAL_ERRORS.DUPLICATE_COMPANY_PROFILE",
  POSTING_LIMIT_EXCEEDED: "PORTAL_ERRORS.POSTING_LIMIT_EXCEEDED",
  DUPLICATE_APPLICATION: "PORTAL_ERRORS.DUPLICATE_APPLICATION",
  INVALID_STATUS_TRANSITION: "PORTAL_ERRORS.INVALID_STATUS_TRANSITION",
  ALREADY_SHARED: "PORTAL_ERRORS.ALREADY_SHARED",
  APPROVAL_INTEGRITY_VIOLATION: "PORTAL_ERRORS.APPROVAL_INTEGRITY_VIOLATION",
  MAX_REVISIONS_REACHED: "PORTAL_ERRORS.MAX_REVISIONS_REACHED",
  DUPLICATE_SEEKER_PROFILE: "PORTAL_ERRORS.DUPLICATE_SEEKER_PROFILE",
} as const;

export type PortalErrorCode = (typeof PORTAL_ERRORS)[keyof typeof PORTAL_ERRORS];

/**
 * Maximum number of "request changes" cycles allowed per posting before it
 * must be approved or rejected. Single source of truth — imported by both the
 * service layer (revision-count guard) and the UI (disabled-button state).
 */
export const MAX_REVISION_COUNT = 3;

/** Rejection categories — also used in Zod schema (admin-review.ts) */
export const REJECTION_CATEGORIES = [
  "policy_violation",
  "inappropriate_content",
  "insufficient_detail",
  "other",
] as const;

export type RejectionCategory = (typeof REJECTION_CATEGORIES)[number];
