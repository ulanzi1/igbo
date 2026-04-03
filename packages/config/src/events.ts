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
// Portal event payloads — STUB: IDs only.
// Rich fields (title, status enums, etc.) added in Epic 1+ when schemas exist.
// TypeScript interface extension makes future additions non-breaking.
// ---------------------------------------------------------------------------

export interface JobPublishedEvent extends BaseEvent {
  jobId: string;
}

export interface JobUpdatedEvent extends BaseEvent {
  jobId: string;
}

export interface JobClosedEvent extends BaseEvent {
  jobId: string;
}

export interface ApplicationSubmittedEvent extends BaseEvent {
  applicationId: string;
  jobId: string;
}

export interface ApplicationStatusChangedEvent extends BaseEvent {
  applicationId: string;
}

export interface ApplicationWithdrawnEvent extends BaseEvent {
  applicationId: string;
}

// Portal event map — used by portal EventBus
export interface PortalEventMap {
  "job.published": JobPublishedEvent;
  "job.updated": JobUpdatedEvent;
  "job.closed": JobClosedEvent;
  "application.submitted": ApplicationSubmittedEvent;
  "application.status_changed": ApplicationStatusChangedEvent;
  "application.withdrawn": ApplicationWithdrawnEvent;
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
