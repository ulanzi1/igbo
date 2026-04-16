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
  CV_LIMIT_REACHED: "PORTAL_ERRORS.CV_LIMIT_REACHED",
  SEEKER_PROFILE_REQUIRED: "PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED",
  INVALID_FILE_TYPE: "PORTAL_ERRORS.INVALID_FILE_TYPE",
  FILE_TOO_LARGE: "PORTAL_ERRORS.FILE_TOO_LARGE",
  ALREADY_FLAGGED: "PORTAL_ERRORS.ALREADY_FLAGGED",
  FLAG_NOT_FOUND: "PORTAL_ERRORS.FLAG_NOT_FOUND",
  INVALID_FLAG_TARGET: "PORTAL_ERRORS.INVALID_FLAG_TARGET",
  ALREADY_REPORTED: "PORTAL_ERRORS.ALREADY_REPORTED",
  REPORT_NOT_FOUND: "PORTAL_ERRORS.REPORT_NOT_FOUND",
  CANNOT_REPORT_OWN_POSTING: "PORTAL_ERRORS.CANNOT_REPORT_OWN_POSTING",
  VERIFICATION_ALREADY_PENDING: "PORTAL_ERRORS.VERIFICATION_ALREADY_PENDING",
  VERIFICATION_NOT_FOUND: "PORTAL_ERRORS.VERIFICATION_NOT_FOUND",
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

export const VIOLATION_CATEGORIES = [
  "misleading_content",
  "discriminatory_language",
  "scam_fraud",
  "terms_of_service_violation",
  "other",
] as const;

export type ViolationCategory = (typeof VIOLATION_CATEGORIES)[number];

export const REPORT_CATEGORIES = [
  "scam_fraud",
  "misleading_info",
  "discriminatory_content",
  "duplicate_posting",
  "other",
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_PRIORITY_THRESHOLDS = {
  ELEVATED: 3,
  URGENT: 5,
} as const;
