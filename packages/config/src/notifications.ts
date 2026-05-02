import type { BaseEvent } from "./events.js";

export const NOTIFICATION_TYPES = [
  "message",
  "mention",
  "group_activity",
  "event_reminder",
  "post_interaction",
  "admin_announcement",
  "system",
] as const;

export type NotificationTypeKey = (typeof NOTIFICATION_TYPES)[number];

export interface ChannelPrefs {
  channelInApp: boolean;
  channelEmail: boolean;
  channelPush: boolean;
  digestMode: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  quietHoursTimezone: string;
  lastDigestAt: Date | null;
}

export const DEFAULT_PREFERENCES: Record<
  NotificationTypeKey,
  { inApp: boolean; email: boolean; push: boolean }
> = {
  message: { inApp: true, email: true, push: true },
  mention: { inApp: true, email: false, push: true },
  group_activity: { inApp: true, email: false, push: false },
  event_reminder: { inApp: true, email: true, push: true },
  post_interaction: { inApp: true, email: false, push: false },
  admin_announcement: { inApp: true, email: true, push: true },
  system: { inApp: true, email: false, push: false },
};

// ---------------------------------------------------------------------------
// Portal Notification Event Catalog (P-6.1A)
// Single source of truth for all portal notification event types, payload
// shapes, and priority tier classification. All downstream 6.x stories
// (routing, delivery, digest, preferences) reference this catalog.
//
// Key distinction: these are NOTIFICATION payloads (user-facing, routing
// pipeline contracts), NOT EventBus events. The routing pipeline (6.1B) maps
// EventBus events → these notification payload shapes.
// ---------------------------------------------------------------------------

/** All portal notification event type string literals. */
export type PortalNotificationEventType =
  | "portal.application.submitted"
  | "portal.application.status_changed"
  | "portal.application.viewed"
  | "portal.message.received"
  | "portal.job.approved"
  | "portal.job.rejected"
  | "portal.job.changes_requested"
  | "portal.job.expired"
  | "portal.referral.status_changed"
  | "portal.match.new_recommendations"
  | "portal.saved_search.new_results";

/**
 * Runtime array of all portal notification event types.
 * Used for iteration, tests, and runtime membership checks.
 */
export const PORTAL_NOTIFICATION_EVENT_TYPES: PortalNotificationEventType[] = [
  "portal.application.submitted",
  "portal.application.status_changed",
  "portal.application.viewed",
  "portal.message.received",
  "portal.job.approved",
  "portal.job.rejected",
  "portal.job.changes_requested",
  "portal.job.expired",
  "portal.referral.status_changed",
  "portal.match.new_recommendations",
  "portal.saved_search.new_results",
];

// ---------------------------------------------------------------------------
// Portal Notification Event Interfaces (Task 1)
// Each interface extends BaseEvent (eventId, version, timestamp, emittedBy?,
// idempotencyKey?) and adds the user-facing fields the routing pipeline needs.
// ---------------------------------------------------------------------------

/** Employer receives this when a seeker submits an application. System-critical. */
export interface PortalApplicationSubmittedNotification extends BaseEvent {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  seekerUserId: string;
  seekerName: string;
  employerUserId: string;
  companyName: string;
}

/** Seeker receives this when their application status changes. */
export interface PortalApplicationStatusChangedNotification extends BaseEvent {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  fromStatus: string;
  toStatus: string;
  actorUserId: string;
  actorRole: string;
}

/**
 * Seeker receives this when an employer views their application.
 * Future event — emitter introduced in Story 6.5 (outbox pattern).
 */
export interface PortalApplicationViewedNotification extends BaseEvent {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  seekerUserId: string;
  employerUserId: string;
}

/**
 * Recipient receives this for a new portal message.
 * Maps from PortalMessageSentEvent; messagePreview is 50 chars max (contract-level truncation).
 */
export interface PortalMessageReceivedNotification extends BaseEvent {
  conversationId: string;
  applicationId: string;
  jobTitle: string;
  senderUserId: string;
  senderName: string;
  /** Content truncated to 50 chars at emit time. Downstream consumers MUST NOT re-truncate. */
  messagePreview: string;
}

/** Employer receives this when their job posting is approved. */
export interface PortalJobApprovedNotification extends BaseEvent {
  jobId: string;
  jobTitle: string;
  companyName: string;
  employerUserId: string;
}

/** Employer receives this when their job posting is rejected. System-critical. */
export interface PortalJobRejectedNotification extends BaseEvent {
  jobId: string;
  jobTitle: string;
  companyName: string;
  employerUserId: string;
  reason: string;
}

/** Employer receives this when an admin requests changes to their job posting. */
export interface PortalJobChangesRequestedNotification extends BaseEvent {
  jobId: string;
  jobTitle: string;
  companyName: string;
  employerUserId: string;
  requestedChanges: string;
}

/** Employer receives this when their job posting expires. Maps from JobExpiredEvent. */
export interface PortalJobExpiredNotification extends BaseEvent {
  jobId: string;
  jobTitle: string;
  companyName: string;
  employerUserId: string;
  expiredAt: string; // ISO 8601 — use BaseEvent.timestamp if expiredAt not separately tracked
}

/**
 * Referrer receives this when their referred candidate's application status changes.
 * FUTURE event — emitter introduced in Portal Epic 9 (P-9.x). reserved: true in catalog.
 */
export interface PortalReferralStatusChangedNotification extends BaseEvent {
  referralId: string;
  jobId: string;
  jobTitle: string;
  referrerUserId: string;
  seekerName: string;
  newStatus: string;
}

/**
 * Seeker receives this for new job match recommendations.
 * FUTURE event — emitter introduced in Portal Epic 7 (P-7.x). reserved: true in catalog.
 */
export interface PortalMatchNewRecommendationsNotification extends BaseEvent {
  seekerUserId: string;
  jobIds: string[];
  matchScores: number[];
}

/** Seeker receives this when a saved search has new results. Maps from SavedSearchNewResultEvent. */
export interface PortalSavedSearchNewResultsNotification extends BaseEvent {
  savedSearchId: string;
  seekerUserId: string;
  searchName: string;
  newJobIds: string[];
}

// ---------------------------------------------------------------------------
// Priority Tier Catalog (Task 2)
// ---------------------------------------------------------------------------

/** Priority tier for portal notification events. Controls disablement UX and dedup TTL. */
export type NotificationPriorityTier = "system-critical" | "high" | "low";

/**
 * Catalog entry for a single portal notification event type.
 * - priorityTier: controls disablement UX (system-critical = cannot disable)
 * - defaultChannels: initial channel state before user preference overrides
 * - description: human-readable explanation for admin/dev tooling
 * - reserved: true signals no handler should be registered until emitting story is implemented
 */
export interface PortalNotificationCatalogEntry {
  priorityTier: NotificationPriorityTier;
  defaultChannels: { inApp: boolean; push: boolean; email: boolean };
  description: string;
  reserved?: boolean;
}

/**
 * Portal notification catalog — single source of truth for all 11 portal
 * notification event types, their priority tiers, and default channel settings.
 *
 * ARCHITECTURAL RULE: No downstream 6.x story may define notification priority
 * inline. All must reference PORTAL_NOTIFICATION_CATALOG.
 *
 * TODO(6.1B): System-critical events need 24h dedup TTL (vs current 15min
 * NOTIF_DEDUP_TTL_SECONDS). Implement per-tier TTL after routing pipeline
 * handles priority tiers.
 */
export const PORTAL_NOTIFICATION_CATALOG: Record<
  PortalNotificationEventType,
  PortalNotificationCatalogEntry
> = {
  // ── System-critical (cannot be disabled by user) ─────────────────────────
  "portal.application.submitted": {
    priorityTier: "system-critical",
    defaultChannels: { inApp: true, push: true, email: true },
    description:
      "Employer receives notification when a candidate submits an application. " +
      "System-critical for employer side only — seeker confirmation email is a separate delivery path.",
  },
  "portal.job.rejected": {
    priorityTier: "system-critical",
    defaultChannels: { inApp: true, push: true, email: true },
    description: "Employer receives notification when their job posting is rejected by admin.",
  },

  // ── High-priority (default ON, user can disable) ──────────────────────────
  "portal.application.status_changed": {
    priorityTier: "high",
    defaultChannels: { inApp: true, push: true, email: true },
    description: "Seeker receives notification when application status changes.",
  },
  "portal.application.viewed": {
    priorityTier: "high",
    defaultChannels: { inApp: true, push: true, email: true },
    description:
      "Seeker receives notification when employer views their application. " +
      "Informational — moved from system-critical to high so users can disable if noisy.",
  },
  "portal.message.received": {
    priorityTier: "high",
    defaultChannels: { inApp: true, push: true, email: false },
    description:
      "Recipient receives notification for a new portal message. " +
      "Email OFF by default — messages are time-sensitive (push handles immediacy).",
  },
  "portal.job.approved": {
    priorityTier: "high",
    defaultChannels: { inApp: true, push: true, email: true },
    description: "Employer receives notification when their job posting is approved.",
  },
  "portal.job.changes_requested": {
    priorityTier: "high",
    defaultChannels: { inApp: true, push: true, email: true },
    description: "Employer receives notification when admin requests changes to their job posting.",
  },
  "portal.job.expired": {
    priorityTier: "high",
    defaultChannels: { inApp: true, push: true, email: true },
    description: "Employer receives notification when their job posting expires.",
  },
  "portal.referral.status_changed": {
    priorityTier: "high",
    defaultChannels: { inApp: true, push: true, email: true },
    description:
      "Referrer receives notification when their referred candidate's application status changes.",
    reserved: true, // FUTURE: emitter in Portal Epic 9 (P-9.x)
  },

  // ── Low-priority (default to digest) ─────────────────────────────────────
  "portal.match.new_recommendations": {
    priorityTier: "low",
    defaultChannels: { inApp: true, push: false, email: false },
    description: "Seeker receives notification for new job match recommendations. Digest-only.",
    reserved: true, // FUTURE: emitter in Portal Epic 7 (P-7.x)
  },
  "portal.saved_search.new_results": {
    priorityTier: "low",
    defaultChannels: { inApp: true, push: false, email: false },
    description:
      "Seeker receives notification when a saved search has new results. Digest-only email.",
  },
};

// ---------------------------------------------------------------------------
// Priority Tier Helper Functions (Task 2.4)
// ---------------------------------------------------------------------------

/** Returns true if the event type is system-critical (cannot be disabled by user). */
export function isSystemCritical(eventType: string): boolean {
  const entry = PORTAL_NOTIFICATION_CATALOG[eventType as PortalNotificationEventType];
  return entry?.priorityTier === "system-critical";
}

/** Returns true if the event type is high-priority (default ON, user can disable). */
export function isHighPriority(eventType: string): boolean {
  const entry = PORTAL_NOTIFICATION_CATALOG[eventType as PortalNotificationEventType];
  return entry?.priorityTier === "high";
}

/** Returns true if the event type is low-priority (default to digest). */
export function isLowPriority(eventType: string): boolean {
  const entry = PORTAL_NOTIFICATION_CATALOG[eventType as PortalNotificationEventType];
  return entry?.priorityTier === "low";
}
