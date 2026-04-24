import { randomUUID } from "node:crypto";

/**
 * Base event envelope — ALL cross-app events extend this.
 *
 * DESIGN RULES:
 * 1. Every event carries `eventId` (UUID) for idempotent processing.
 *    Consumers MUST deduplicate by eventId (Redis SET NX with TTL).
 * 2. Every event carries `version` (integer) for schema evolution.
 *    Consumers MUST ignore events with versions they don't understand.
 * 3. Consumers MUST NOT rely on event ordering.
 *    Events may arrive out-of-order due to Redis pub/sub, retries,
 *    or multi-instance fan-out. Design handlers to be order-independent.
 */
export interface BaseEvent {
  eventId: string; // UUID — unique per emission, used for dedup
  version: number; // Schema version — start at 1, bump on breaking change
  timestamp: string; // ISO 8601
}

/** Helper to create base event fields. Call in every emit(). */
export function createEventEnvelope(version = 1): BaseEvent {
  return {
    eventId: randomUUID(),
    version,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Portal event payloads — enriched in P-1.1A (VD-2 resolved).
// All interfaces extend BaseEvent for eventId, version, timestamp.
// ---------------------------------------------------------------------------

export interface JobPublishedEvent extends BaseEvent {
  jobId: string;
  companyId: string;
  title: string;
  employmentType: string;
  status: string;
}

export interface JobUpdatedEvent extends BaseEvent {
  jobId: string;
  companyId: string;
  changes: Record<string, unknown>;
}

export interface JobClosedEvent extends BaseEvent {
  jobId: string;
  companyId: string;
  reason?: string;
}

export interface JobExpiredEvent extends BaseEvent {
  jobId: string;
  companyId: string;
  title: string;
  employerUserId: string;
  // NOTE: no separate expiredAt — use BaseEvent.timestamp (consistent with JobClosedEvent pattern)
}

export interface JobExpiryWarningEvent extends BaseEvent {
  jobId: string;
  companyId: string;
  title: string;
  employerUserId: string;
  expiresAt: string; // the posting's scheduled expiry date (future timestamp)
  daysRemaining: number;
}

export interface ApplicationSubmittedEvent extends BaseEvent {
  applicationId: string;
  jobId: string;
  seekerUserId: string;
  companyId: string;
  employerUserId: string;
}

export interface ApplicationStatusChangedEvent extends BaseEvent {
  applicationId: string;
  jobId: string;
  seekerUserId: string;
  companyId: string;
  previousStatus: string;
  newStatus: string;
  actorUserId: string;
  actorRole: string; // "job_seeker" | "employer" | "job_admin"
}

export interface ApplicationWithdrawnEvent extends BaseEvent {
  applicationId: string;
  jobId: string;
  seekerUserId: string;
  companyId: string;
  previousStatus: string;
  newStatus: string; // always "withdrawn"
  actorUserId: string; // the seeker who withdrew
}

export interface JobViewedEvent extends BaseEvent {
  jobId: string;
  userId: string;
  isNewView: boolean;
}

export interface JobSharedToCommunityEvent extends BaseEvent {
  jobId: string;
  companyId: string;
  communityPostId: string;
  employerUserId: string;
}

export interface JobReviewedEvent extends BaseEvent {
  jobId: string;
  reviewerUserId: string;
  decision: "approved" | "rejected" | "changes_requested";
  companyId: string;
  fastLane?: boolean;
}

export interface JobFlaggedEvent extends BaseEvent {
  jobId: string;
  flagId: string;
  adminUserId: string;
  category: string;
  severity: string;
  companyId: string;
  autoPaused: boolean;
}

export interface PostingReportedEvent extends BaseEvent {
  jobId: string;
  reportId: string;
  reporterUserId: string;
  category: string;
  reportCount: number;
  priorityEscalated: boolean;
  autoPaused: boolean;
}

export interface EmployerVerificationSubmittedEvent extends BaseEvent {
  companyId: string;
  employerUserId: string;
  verificationId: string;
  documentCount: number;
}

export interface EmployerVerificationApprovedEvent extends BaseEvent {
  companyId: string;
  employerUserId: string;
  verificationId: string;
  approvedByAdminId: string;
}

export interface EmployerVerificationRejectedEvent extends BaseEvent {
  companyId: string;
  employerUserId: string;
  verificationId: string;
  rejectedByAdminId: string;
  reason: string;
}

export interface SavedSearchNewResultEvent extends BaseEvent {
  savedSearchId: string;
  userId: string;
  jobId: string;
  jobTitle: string;
  searchName: string;
}

// --- Portal Message Events ---
// Portal events include denormalized data (jobTitle, companyName, senderRole) to avoid
// DB lookups in notification handlers (P-5.6). senderRole distinguishes employer vs seeker
// for notification routing.

export interface PortalMessageSentEvent extends BaseEvent {
  messageId: string;
  senderId: string;
  conversationId: string;
  applicationId: string;
  jobId: string;
  companyId: string;
  jobTitle: string;
  companyName: string;
  content: string;
  contentType: string;
  createdAt: string; // ISO 8601
  parentMessageId?: string | null;
  recipientId: string;
  senderName?: string;
  senderRole: "employer" | "seeker";
  /** File attachments included with the message (empty array if none) */
  attachments?: Array<{
    id: string;
    fileUrl: string;
    fileName: string;
    fileType: string | null;
    fileSize: number | null;
  }>;
}

export interface PortalMessageEditedEvent extends BaseEvent {
  messageId: string;
  conversationId: string;
  applicationId: string;
  senderId: string;
  content: string;
  editedAt: string; // ISO 8601
}

export interface PortalMessageDeletedEvent extends BaseEvent {
  messageId: string;
  conversationId: string;
  applicationId: string;
  senderId: string;
  deletedAt: string; // ISO 8601
}

// Portal event map — used by portal EventBus
export interface PortalEventMap {
  "job.published": JobPublishedEvent;
  "job.updated": JobUpdatedEvent;
  "job.closed": JobClosedEvent;
  "job.expired": JobExpiredEvent;
  "job.expiry_warning": JobExpiryWarningEvent;
  "application.submitted": ApplicationSubmittedEvent;
  "application.status_changed": ApplicationStatusChangedEvent;
  "application.withdrawn": ApplicationWithdrawnEvent;
  "job.viewed": JobViewedEvent;
  "job.shared_to_community": JobSharedToCommunityEvent;
  "job.reviewed": JobReviewedEvent;
  "job.flagged": JobFlaggedEvent;
  "posting.reported": PostingReportedEvent;
  "employer.verification_submitted": EmployerVerificationSubmittedEvent;
  "employer.verification_approved": EmployerVerificationApprovedEvent;
  "employer.verification_rejected": EmployerVerificationRejectedEvent;
  "saved_search.new_result": SavedSearchNewResultEvent;
  "portal.message.sent": PortalMessageSentEvent;
  "portal.message.edited": PortalMessageEditedEvent;
  "portal.message.deleted": PortalMessageDeletedEvent;
}

export type PortalEventName = keyof PortalEventMap;

// Cross-app event names — community listens to these portal events
export const PORTAL_CROSS_APP_EVENTS: PortalEventName[] = [
  "job.published",
  "application.submitted",
  "application.status_changed",
];

// Community events that portal listens to (portal subscribes via event-bridge)
export const COMMUNITY_CROSS_APP_EVENTS = [
  "user.verified",
  "user.role_changed",
  "user.suspended",
] as const;

export type CommunityCrossAppEvent = (typeof COMMUNITY_CROSS_APP_EVENTS)[number];

// ---------------------------------------------------------------------------
// Community cross-app event payloads — STUB: userId only.
// Extended when community emits richer payloads for these cross-app events.
// ---------------------------------------------------------------------------

export interface UserVerifiedCrossAppEvent extends BaseEvent {
  userId: string;
}

export interface UserRoleChangedCrossAppEvent extends BaseEvent {
  userId: string;
}

export interface UserSuspendedCrossAppEvent extends BaseEvent {
  userId: string;
}

// ---------------------------------------------------------------------------
// Notification created event — used by portal notification-service to publish
// real-time delivery after createNotification() DB insert. The eventbus-bridge
// routes "notification.created" channel to /notifications:notification:new.
// ---------------------------------------------------------------------------

/**
 * Published to Redis pub/sub channel "eventbus:notification.created" after
 * createNotification() inserts a record. The eventbus-bridge routes this to
 * Socket.IO /notifications namespace as "notification:new".
 */
export interface NotificationCreatedEvent extends BaseEvent {
  notificationId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
}

/** Community events the portal receives via event-bridge (Redis pub/sub). */
export interface CommunityCrossAppEventMap {
  "user.verified": UserVerifiedCrossAppEvent;
  "user.role_changed": UserRoleChangedCrossAppEvent;
  "user.suspended": UserSuspendedCrossAppEvent;
}

/** All events the portal EventBus can handle — own events + inbound community events. */
export type PortalAllEventMap = PortalEventMap & CommunityCrossAppEventMap;
export type PortalAllEventName = keyof PortalAllEventMap;

/** Redis key for idempotency dedup: SET NX with 24h TTL */
export const EVENT_DEDUP_KEY = (eventId: string) => `event:dedup:${eventId}`;
export const EVENT_DEDUP_TTL_SECONDS = 86400; // 24 hours
