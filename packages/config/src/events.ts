import { randomUUID } from "node:crypto";
import { z } from "zod/v4";

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
  /** Service/module that emitted this event — optional for backward compat with community events */
  emittedBy?: string;
  /** Caller-provided dedup key for business-meaningful idempotency (vs generic eventId dedup) */
  idempotencyKey?: string;
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

// ---------------------------------------------------------------------------
// Zod schemas for portal event validation — enforce at emit time.
// emittedBy is REQUIRED in schemas (z.string().min(1)) even though BaseEvent
// has it as optional (emittedBy?: string). This is intentional: the TS
// interface preserves backward compat with community code; the schema enforces
// it at portal emit time.
// ---------------------------------------------------------------------------

/** Base schema — all portal event schemas extend this. */
const BaseEventSchema = z.object({
  eventId: z.string().uuid(),
  version: z.number().int().positive(),
  timestamp: z.string().datetime(),
  emittedBy: z.string().min(1), // REQUIRED in portal schemas
  idempotencyKey: z.string().optional(),
});

const JobPublishedEventSchema = BaseEventSchema.extend({
  jobId: z.string(),
  companyId: z.string(),
  title: z.string(),
  employmentType: z.string(),
  status: z.string(),
});

const JobUpdatedEventSchema = BaseEventSchema.extend({
  jobId: z.string(),
  companyId: z.string(),
  changes: z.record(z.string(), z.unknown()),
});

const JobClosedEventSchema = BaseEventSchema.extend({
  jobId: z.string(),
  companyId: z.string(),
  reason: z.string().optional(),
});

const JobExpiredEventSchema = BaseEventSchema.extend({
  jobId: z.string(),
  companyId: z.string(),
  title: z.string(),
  employerUserId: z.string(),
});

const JobExpiryWarningEventSchema = BaseEventSchema.extend({
  jobId: z.string(),
  companyId: z.string(),
  title: z.string(),
  employerUserId: z.string(),
  expiresAt: z.string().datetime(),
  daysRemaining: z.number().int().nonnegative(),
});

const ApplicationSubmittedEventSchema = BaseEventSchema.extend({
  applicationId: z.string(),
  jobId: z.string(),
  seekerUserId: z.string(),
  companyId: z.string(),
  employerUserId: z.string(),
});

const ApplicationStatusChangedEventSchema = BaseEventSchema.extend({
  applicationId: z.string(),
  jobId: z.string(),
  seekerUserId: z.string(),
  companyId: z.string(),
  previousStatus: z.string(),
  newStatus: z.string(),
  actorUserId: z.string(),
  actorRole: z.string(),
});

const ApplicationWithdrawnEventSchema = BaseEventSchema.extend({
  applicationId: z.string(),
  jobId: z.string(),
  seekerUserId: z.string(),
  companyId: z.string(),
  previousStatus: z.string(),
  newStatus: z.string(),
  actorUserId: z.string(),
});

const JobViewedEventSchema = BaseEventSchema.extend({
  jobId: z.string(),
  userId: z.string(),
  isNewView: z.boolean(),
});

const JobSharedToCommunityEventSchema = BaseEventSchema.extend({
  jobId: z.string(),
  companyId: z.string(),
  communityPostId: z.string(),
  employerUserId: z.string(),
});

const JobReviewedEventSchema = BaseEventSchema.extend({
  jobId: z.string(),
  reviewerUserId: z.string(),
  decision: z.enum(["approved", "rejected", "changes_requested"]),
  companyId: z.string(),
  fastLane: z.boolean().optional(),
});

const JobFlaggedEventSchema = BaseEventSchema.extend({
  jobId: z.string(),
  flagId: z.string(),
  adminUserId: z.string(),
  category: z.string(),
  severity: z.string(),
  companyId: z.string(),
  autoPaused: z.boolean(),
});

const PostingReportedEventSchema = BaseEventSchema.extend({
  jobId: z.string(),
  reportId: z.string(),
  reporterUserId: z.string(),
  category: z.string(),
  reportCount: z.number().int(),
  priorityEscalated: z.boolean(),
  autoPaused: z.boolean(),
});

const EmployerVerificationSubmittedEventSchema = BaseEventSchema.extend({
  companyId: z.string(),
  employerUserId: z.string(),
  verificationId: z.string(),
  documentCount: z.number().int(),
});

const EmployerVerificationApprovedEventSchema = BaseEventSchema.extend({
  companyId: z.string(),
  employerUserId: z.string(),
  verificationId: z.string(),
  approvedByAdminId: z.string(),
});

const EmployerVerificationRejectedEventSchema = BaseEventSchema.extend({
  companyId: z.string(),
  employerUserId: z.string(),
  verificationId: z.string(),
  rejectedByAdminId: z.string(),
  reason: z.string(),
});

const SavedSearchNewResultEventSchema = BaseEventSchema.extend({
  savedSearchId: z.string(),
  userId: z.string(),
  jobId: z.string(),
  jobTitle: z.string(),
  searchName: z.string(),
});

const PortalMessageSentEventSchema = BaseEventSchema.extend({
  messageId: z.string(),
  senderId: z.string(),
  conversationId: z.string(),
  applicationId: z.string(),
  jobId: z.string(),
  companyId: z.string(),
  jobTitle: z.string(),
  companyName: z.string(),
  content: z.string(),
  contentType: z.string(),
  createdAt: z.string().datetime(),
  parentMessageId: z.string().nullable().optional(),
  recipientId: z.string(),
  senderName: z.string().optional(),
  senderRole: z.enum(["employer", "seeker"]),
  attachments: z
    .array(
      z.object({
        id: z.string(),
        fileUrl: z.string(),
        fileName: z.string(),
        fileType: z.string().nullable(),
        fileSize: z.number().nullable(),
      }),
    )
    .optional(),
});

const PortalMessageEditedEventSchema = BaseEventSchema.extend({
  messageId: z.string(),
  conversationId: z.string(),
  applicationId: z.string(),
  senderId: z.string(),
  content: z.string(),
  editedAt: z.string().datetime(),
});

const PortalMessageDeletedEventSchema = BaseEventSchema.extend({
  messageId: z.string(),
  conversationId: z.string(),
  applicationId: z.string(),
  senderId: z.string(),
  deletedAt: z.string().datetime(),
});

/**
 * Zod schemas for all 20 portal event types.
 * Used by PortalTypedEventBus.emit() to validate payloads at emission time.
 * emittedBy is REQUIRED by these schemas even though BaseEvent has it optional.
 */
export const portalEventSchemas: Record<PortalEventName, z.ZodType> = {
  "job.published": JobPublishedEventSchema,
  "job.updated": JobUpdatedEventSchema,
  "job.closed": JobClosedEventSchema,
  "job.expired": JobExpiredEventSchema,
  "job.expiry_warning": JobExpiryWarningEventSchema,
  "application.submitted": ApplicationSubmittedEventSchema,
  "application.status_changed": ApplicationStatusChangedEventSchema,
  "application.withdrawn": ApplicationWithdrawnEventSchema,
  "job.viewed": JobViewedEventSchema,
  "job.shared_to_community": JobSharedToCommunityEventSchema,
  "job.reviewed": JobReviewedEventSchema,
  "job.flagged": JobFlaggedEventSchema,
  "posting.reported": PostingReportedEventSchema,
  "employer.verification_submitted": EmployerVerificationSubmittedEventSchema,
  "employer.verification_approved": EmployerVerificationApprovedEventSchema,
  "employer.verification_rejected": EmployerVerificationRejectedEventSchema,
  "saved_search.new_result": SavedSearchNewResultEventSchema,
  "portal.message.sent": PortalMessageSentEventSchema,
  "portal.message.edited": PortalMessageEditedEventSchema,
  "portal.message.deleted": PortalMessageDeletedEventSchema,
};
